package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
)

func createPlayingBlackjackGame(t *testing.T, ctx context.Context, store *BlackjackStore, prefix string) blackjackSession {
	t.Helper()
	for attempt := range 20 {
		session, err := store.Create(ctx, fmt.Sprintf("%s-%d", prefix, attempt), "dm:a:b", "a", "b")
		if err != nil {
			t.Fatalf("create game: %v", err)
		}
		if session.Status == "playing" {
			activated, err := store.Activate(ctx, session.GameID)
			if err != nil {
				t.Fatalf("activate game: %v", err)
			}
			return activated
		}
		store.redis.Del(ctx, blackjackGameKey(session.GameID))
		store.redis.ZRem(ctx, blackjackUserGamesKey("a"), session.GameID)
		store.redis.ZRem(ctx, blackjackUserGamesKey("b"), session.GameID)
		store.redis.ZRem(ctx, blackjackDeadlineKey, session.GameID)
	}
	t.Fatal("could not create a non-natural blackjack game")
	return blackjackSession{}
}

func TestBlackjackDeckHasUniqueCards(t *testing.T) {
	deck := blackjackDeck()
	if len(deck) != 52 {
		t.Fatalf("deck size = %d, want 52", len(deck))
	}
	seen := map[string]bool{}
	for _, card := range deck {
		if seen[card] {
			t.Fatalf("duplicate card %q", card)
		}
		seen[card] = true
	}
}

func TestBlackjackScoreTreatsAceAsOneWhenNeeded(t *testing.T) {
	if score := blackjackScore([]string{"spade01", "heart10", "club05"}); score != 16 {
		t.Fatalf("score = %d, want 16", score)
	}
	if score := blackjackScore([]string{"spade01", "heart10"}); score != 21 {
		t.Fatalf("score = %d, want 21", score)
	}
}

func TestBlackjackHitKeepsTurnUntilPlayerStands(t *testing.T) {
	now := time.Now()
	session := dealBlackjackSession("game-rules", "dm:a:b", []string{"a", "b"}, "a", now)
	session.Hands["a"] = []string{"club02", "heart03"}
	session.Deck = []string{"spade04"}
	session.Status = "playing"
	session.CurrentTurn = "a"
	session.Stood = map[string]bool{"a": false, "b": false}

	if !applyBlackjackActionToSession(&session, "a", "hit", now.Add(time.Second)) {
		t.Fatal("hit was rejected")
	}
	if session.CurrentTurn != "a" || len(session.Hands["a"]) != 3 {
		t.Fatalf("after hit current turn = %q, hand = %#v", session.CurrentTurn, session.Hands["a"])
	}
	if !applyBlackjackActionToSession(&session, "a", "stand", now.Add(2*time.Second)) {
		t.Fatal("stand was rejected")
	}
	if session.CurrentTurn != "b" || !session.Stood["a"] {
		t.Fatalf("after stand current turn = %q, stood = %#v", session.CurrentTurn, session.Stood)
	}
}

func TestBlackjackRestartAlternatesStartingPlayer(t *testing.T) {
	now := time.Now()
	session := dealBlackjackSession("game-restart", "dm:a:b", []string{"a", "b"}, "a", now)
	session.Status = "finished"
	if !applyBlackjackActionToSession(&session, "a", "restart", now.Add(time.Minute)) {
		t.Fatal("first restart vote was rejected")
	}
	if session.Status != "finished" || !session.RestartVotes["a"] {
		t.Fatalf("first restart vote did not wait: %#v", session)
	}
	if !applyBlackjackActionToSession(&session, "b", "restart", now.Add(time.Minute+time.Second)) {
		t.Fatal("second restart vote was rejected")
	}
	if session.StartingPlayer != "b" {
		t.Fatalf("starter = %q, want b", session.StartingPlayer)
	}
	if session.Status == "playing" && session.CurrentTurn != "b" {
		t.Fatalf("turn = %q, want b", session.CurrentTurn)
	}
	if session.Status == "finished" && session.ResultReason != "natural_blackjack" {
		t.Fatalf("unexpected finished restart: %#v", session)
	}
}

func TestBlackjackNaturalFinishesImmediately(t *testing.T) {
	session := blackjackSession{
		PlayerIDs: []string{"a", "b"},
		Hands: map[string][]string{
			"a": {"spade01", "heart13"},
			"b": {"club10", "diamond09"},
		},
		Stood:       map[string]bool{"a": false, "b": false},
		Status:      "playing",
		CurrentTurn: "a",
	}
	if !resolveNaturalBlackjack(&session) {
		t.Fatal("natural blackjack was not resolved")
	}
	if session.Status != "finished" || session.Winner != "a" || session.ResultReason != "natural_blackjack" {
		t.Fatalf("natural result = %#v", session)
	}
}

func TestBlackjackStateHidesOpponentHandUntilStand(t *testing.T) {
	session := blackjackSession{
		PlayerIDs: []string{"a", "b"},
		Hands: map[string][]string{
			"a": {"spade02", "heart03"},
			"b": {"club10", "diamond09"},
		},
		Stood:  map[string]bool{"a": false, "b": false},
		Status: "playing",
	}
	state := blackjackStateForPlayer(session, "a")
	hands := state["hands"].(map[string][]string)
	if len(hands["a"]) != 2 || len(hands["b"]) != 0 {
		t.Fatalf("viewer hand = %#v, opponent hand = %#v", hands["a"], hands["b"])
	}
	if state["hidden_card_counts"].(bson.M)["b"] != 2 {
		t.Fatalf("hidden counts = %#v", state["hidden_card_counts"])
	}

	session.Stood["b"] = true
	revealed := blackjackStateForPlayer(session, "a")
	if len(revealed["hands"].(map[string][]string)["b"]) != 2 {
		t.Fatalf("stood opponent hand was not revealed: %#v", revealed["hands"])
	}
}

func TestBlackjackStorePersistsGameForReconnect(t *testing.T) {
	server := miniredis.RunT(t)
	firstClient := redis.NewClient(&redis.Options{Addr: server.Addr()})
	secondClient := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		firstClient.Close()
		secondClient.Close()
	})

	ctx := context.Background()
	firstStore := NewBlackjackStore(firstClient)
	secondStore := NewBlackjackStore(secondClient)
	created := createPlayingBlackjackGame(t, ctx, firstStore, "game-1")
	if _, err := secondStore.Create(ctx, created.GameID, "dm:a:b", "a", "b"); !errors.Is(err, errBlackjackExists) {
		t.Fatalf("duplicate create error = %v, want %v", err, errBlackjackExists)
	}

	sessions, err := secondStore.ListForUser(ctx, "a")
	if err != nil {
		t.Fatalf("list games: %v", err)
	}
	if len(sessions) != 1 || sessions[0].GameID != created.GameID {
		t.Fatalf("sessions = %#v, want game-1", sessions)
	}
	if len(sessions[0].Deck) != 48 || len(sessions[0].Hands["a"]) != 2 || len(sessions[0].Hands["b"]) != 2 {
		t.Fatalf("persisted game has invalid deal: %#v", sessions[0])
	}

	starter := created.StartingPlayer
	opponent := created.PlayerIDs[0]
	if starter == opponent {
		opponent = created.PlayerIDs[1]
	}
	updated, err := secondStore.ApplyAction(ctx, starter, created.GameID, "stand")
	if err != nil {
		t.Fatalf("apply action: %v", err)
	}
	if !updated.Stood[starter] || updated.CurrentTurn != opponent {
		t.Fatalf("updated game = %#v, want starter stood and opponent turn", updated)
	}
	if updated.Revision != created.Revision+1 {
		t.Fatalf("updated revision = %d, want %d", updated.Revision, created.Revision+1)
	}
}

func TestBlackjackStoreKeepsAcceptedGamePendingUntilActivation(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { client.Close() })
	store := NewBlackjackStore(client)
	ctx := context.Background()

	pending, err := store.Create(ctx, "game-pending", "dm:a:b", "a", "b")
	if err != nil {
		t.Fatalf("create pending game: %v", err)
	}
	if sessions, err := store.ListForUser(ctx, "a"); err != nil || len(sessions) != 0 {
		t.Fatalf("pending reconnect sessions = %#v, error = %v", sessions, err)
	}
	if _, err := store.ApplyAction(ctx, pending.CurrentTurn, pending.GameID, "stand"); !errors.Is(err, errBlackjackInvalid) {
		t.Fatalf("pending action error = %v, want %v", err, errBlackjackInvalid)
	}
	activated, err := store.Activate(ctx, pending.GameID)
	if err != nil || activated.PendingAcceptance {
		t.Fatalf("activate game = %#v, error = %v", activated, err)
	}
	if sessions, err := store.ListForUser(ctx, "a"); err != nil || len(sessions) != 1 {
		t.Fatalf("active reconnect sessions = %#v, error = %v", sessions, err)
	}
}

func TestBlackjackStoreExpiresIdleGame(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { client.Close() })
	store := NewBlackjackStore(client)
	ctx := context.Background()

	created := createPlayingBlackjackGame(t, ctx, store, "game-timeout")
	expired, err := store.ExpireDue(ctx, created.LastActionAt.Add(blackjackIdleTimeout+time.Second))
	if err != nil {
		t.Fatalf("expire games: %v", err)
	}
	if len(expired) != 1 || expired[0].Status != "canceled" || expired[0].CurrentTurn != "" {
		t.Fatalf("expired games = %#v", expired)
	}
	if score, err := client.ZScore(ctx, blackjackDeadlineKey, created.GameID).Result(); !errors.Is(err, redis.Nil) {
		t.Fatalf("deadline score = %v, error = %v, want missing", score, err)
	}
	sessions, err := store.ListForUser(ctx, "a")
	if err != nil || len(sessions) != 1 || sessions[0].Status != "canceled" {
		t.Fatalf("reconnect sessions = %#v, error = %v, want canceled game", sessions, err)
	}
}

func TestBlackjackStoreRejectsActionAfterDeadline(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { client.Close() })
	store := NewBlackjackStore(client)
	ctx := context.Background()
	created := createPlayingBlackjackGame(t, ctx, store, "game-action-timeout")
	created.LastActionAt = time.Now().Add(-blackjackIdleTimeout - time.Second)
	value, err := json.Marshal(created)
	if err != nil {
		t.Fatalf("marshal game: %v", err)
	}
	if err := client.Set(ctx, blackjackGameKey(created.GameID), value, blackjackSessionTTL).Err(); err != nil {
		t.Fatalf("store expired game: %v", err)
	}

	updated, err := store.ApplyAction(ctx, created.StartingPlayer, created.GameID, "hit")
	if err != nil {
		t.Fatalf("expired action: %v", err)
	}
	if updated.Status != "canceled" || updated.ResultReason != "timeout" {
		t.Fatalf("expired action revived game: %#v", updated)
	}
}

func TestBlackjackStoreSerializesConcurrentActions(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { client.Close() })
	store := NewBlackjackStore(client)
	ctx := context.Background()
	created := createPlayingBlackjackGame(t, ctx, store, "game-race")

	errorsByAction := make(chan error, 2)
	var wait sync.WaitGroup
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, err := store.ApplyAction(ctx, created.StartingPlayer, created.GameID, "stand")
			errorsByAction <- err
		}()
	}
	wait.Wait()
	close(errorsByAction)

	succeeded, rejected := 0, 0
	for err := range errorsByAction {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, errBlackjackInvalid):
			rejected++
		default:
			t.Fatalf("concurrent action error = %v", err)
		}
	}
	if succeeded != 1 || rejected != 1 {
		t.Fatalf("succeeded = %d, rejected = %d, want 1 each", succeeded, rejected)
	}
}
