package chat

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

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
		t.Fatal("restart was rejected")
	}
	if session.StartingPlayer != "b" || session.CurrentTurn != "b" {
		t.Fatalf("starter = %q, turn = %q, want b", session.StartingPlayer, session.CurrentTurn)
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
	created, err := firstStore.Create(ctx, "game-1", "dm:a:b", "a", "b")
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
	if _, err := secondStore.Create(ctx, "game-1", "dm:a:b", "a", "b"); !errors.Is(err, errBlackjackExists) {
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
	updated, err := secondStore.ApplyAction(ctx, starter, "game-1", "stand")
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

func TestBlackjackStoreExpiresIdleGame(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { client.Close() })
	store := NewBlackjackStore(client)
	ctx := context.Background()

	created, err := store.Create(ctx, "game-timeout", "dm:a:b", "a", "b")
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
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

func TestBlackjackStoreSerializesConcurrentActions(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { client.Close() })
	store := NewBlackjackStore(client)
	ctx := context.Background()
	created, err := store.Create(ctx, "game-race", "dm:a:b", "a", "b")
	if err != nil {
		t.Fatalf("create game: %v", err)
	}

	errorsByAction := make(chan error, 2)
	var wait sync.WaitGroup
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, err := store.ApplyAction(ctx, created.StartingPlayer, "game-race", "stand")
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
