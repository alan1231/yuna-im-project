package chat

import (
	"context"
	cryptorand "crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"math/rand"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
)

const (
	blackjackIdleTimeout   = 5 * time.Minute
	blackjackSessionTTL    = 30 * time.Minute
	blackjackIndexTTL      = 24 * time.Hour
	blackjackDeadlineKey   = "yuna-im:blackjack:deadlines"
	blackjackEventsChannel = "yuna-im:blackjack-events"
)

var (
	errBlackjackExists  = errors.New("blackjack game already exists")
	errBlackjackInvalid = errors.New("invalid blackjack action")
)

type blackjackSession struct {
	GameID         string              `json:"game_id"`
	ConversationID string              `json:"conversation_id"`
	PlayerIDs      []string            `json:"player_ids"`
	Status         string              `json:"status"`
	CreatedAt      time.Time           `json:"created_at"`
	Deck           []string            `json:"deck"`
	Hands          map[string][]string `json:"hands"`
	Stood          map[string]bool     `json:"stood"`
	StartingPlayer string              `json:"starting_player"`
	CurrentTurn    string              `json:"current_turn"`
	Winner         string              `json:"winner,omitempty"`
	LastActionAt   time.Time           `json:"last_action_at"`
	Revision       int64               `json:"revision"`
}

type BlackjackStore struct {
	redis *redis.Client
}

func NewBlackjackStore(redisClient *redis.Client) *BlackjackStore {
	return &BlackjackStore{redis: redisClient}
}

func blackjackGameKey(gameID string) string {
	return "yuna-im:blackjack:game:" + gameID
}

func blackjackUserGamesKey(userID string) string {
	return "yuna-im:blackjack:user:" + userID + ":games"
}

func newBlackjackSession(gameID, conversationID, firstPlayerID, secondPlayerID string, now time.Time) blackjackSession {
	players := []string{firstPlayerID, secondPlayerID}
	starterIndex, err := cryptorand.Int(cryptorand.Reader, big.NewInt(int64(len(players))))
	if err != nil {
		starterIndex = big.NewInt(0)
	}
	return dealBlackjackSession(gameID, conversationID, players, players[starterIndex.Int64()], now)
}

func dealBlackjackSession(gameID, conversationID string, playerIDs []string, startingPlayer string, now time.Time) blackjackSession {
	deck := blackjackDeck()
	shuffleBlackjackDeck(deck)
	firstPlayerID, secondPlayerID := playerIDs[0], playerIDs[1]
	hands := map[string][]string{firstPlayerID: {}, secondPlayerID: {}}
	dealOrder := []string{startingPlayer, firstPlayerID}
	if startingPlayer == firstPlayerID {
		dealOrder[1] = secondPlayerID
	}
	for range 2 {
		for _, playerID := range dealOrder {
			hands[playerID] = append(hands[playerID], deck[0])
			deck = deck[1:]
		}
	}
	return blackjackSession{
		GameID:         gameID,
		ConversationID: conversationID,
		PlayerIDs:      append([]string(nil), playerIDs...),
		Status:         "playing",
		CreatedAt:      now,
		Deck:           deck,
		Hands:          hands,
		Stood:          map[string]bool{firstPlayerID: false, secondPlayerID: false},
		StartingPlayer: startingPlayer,
		CurrentTurn:    startingPlayer,
		LastActionAt:   now,
		Revision:       1,
	}
}

func blackjackDeck() []string {
	deck := make([]string, 0, 52)
	for _, suit := range []string{"club", "diamond", "heart", "spade"} {
		for rank := 1; rank <= 13; rank++ {
			deck = append(deck, fmt.Sprintf("%s%02d", suit, rank))
		}
	}
	return deck
}

func shuffleBlackjackDeck(deck []string) {
	rand.New(rand.NewSource(time.Now().UnixNano())).Shuffle(len(deck), func(i, j int) {
		deck[i], deck[j] = deck[j], deck[i]
	})
}

func blackjackScore(cards []string) int {
	score, aces := 0, 0
	for _, card := range cards {
		if len(card) < 2 {
			continue
		}
		rank := 0
		fmt.Sscanf(card[len(card)-2:], "%d", &rank)
		if rank == 1 {
			score += 11
			aces++
		} else if rank > 10 {
			score += 10
		} else {
			score += rank
		}
	}
	for score > 21 && aces > 0 {
		score -= 10
		aces--
	}
	return score
}

func blackjackState(session blackjackSession) bson.M {
	scores := bson.M{}
	for playerID, hand := range session.Hands {
		scores[playerID] = blackjackScore(hand)
	}
	return bson.M{
		"game_id": session.GameID, "game_type": "blackjack", "conversation_id": session.ConversationID,
		"player_ids": session.PlayerIDs, "hands": session.Hands, "scores": scores,
		"status": session.Status, "starting_player": session.StartingPlayer,
		"current_turn": session.CurrentTurn, "winner": session.Winner,
		"revision": session.Revision,
	}
}

func applyBlackjackActionToSession(session *blackjackSession, userID, action string, now time.Time) bool {
	if len(session.PlayerIDs) != 2 || userID != session.PlayerIDs[0] && userID != session.PlayerIDs[1] {
		return false
	}
	if action == "restart" {
		if session.Status != "finished" && session.Status != "canceled" {
			return false
		}
		previousStarter := session.StartingPlayer
		if previousStarter == "" {
			previousStarter = session.PlayerIDs[0]
		}
		nextStarter := session.PlayerIDs[0]
		if previousStarter == session.PlayerIDs[0] {
			nextStarter = session.PlayerIDs[1]
		}
		next := dealBlackjackSession(session.GameID, session.ConversationID, session.PlayerIDs, nextStarter, now)
		next.Revision = session.Revision + 1
		*session = next
		return true
	}
	if action == "cancel" {
		if session.Status != "playing" {
			return false
		}
		session.Status, session.Winner, session.CurrentTurn = "canceled", "", ""
		session.LastActionAt = now
		session.Revision++
		return true
	}
	if session.Status != "playing" || session.CurrentTurn != userID {
		return false
	}

	session.LastActionAt = now
	hand := session.Hands[userID]
	switch action {
	case "hit":
		if len(session.Deck) == 0 {
			return false
		}
		hand = append(hand, session.Deck[0])
		session.Deck = session.Deck[1:]
		session.Hands[userID] = hand
		if blackjackScore(hand) > 21 {
			session.Stood[userID] = true
		}
	case "stand":
		session.Stood[userID] = true
	default:
		return false
	}

	first, second := session.PlayerIDs[0], session.PlayerIDs[1]
	if session.Stood[first] && session.Stood[second] || session.Stood[userID] && blackjackScore(hand) > 21 {
		session.Status = "finished"
		session.CurrentTurn = ""
		firstScore, secondScore := blackjackScore(session.Hands[first]), blackjackScore(session.Hands[second])
		switch {
		case firstScore > 21 && secondScore > 21, firstScore == secondScore:
			session.Winner = "draw"
		case firstScore > 21 || firstScore < secondScore && secondScore <= 21:
			session.Winner = second
		default:
			session.Winner = first
		}
	} else if action == "stand" {
		if userID == first {
			session.CurrentTurn = second
		} else {
			session.CurrentTurn = first
		}
	}
	session.Revision++
	return true
}

func (store *BlackjackStore) Create(ctx context.Context, gameID, conversationID, firstPlayerID, secondPlayerID string) (blackjackSession, error) {
	session := newBlackjackSession(gameID, conversationID, firstPlayerID, secondPlayerID, time.Now())
	key := blackjackGameKey(gameID)
	for attempts := 0; attempts < 3; attempts++ {
		err := store.redis.Watch(ctx, func(tx *redis.Tx) error {
			if _, err := tx.Get(ctx, key).Result(); err == nil {
				return errBlackjackExists
			} else if !errors.Is(err, redis.Nil) {
				return err
			}
			return store.writeSession(ctx, tx, session, true, "game_start")
		}, key)
		if !errors.Is(err, redis.TxFailedErr) {
			return session, err
		}
	}
	return blackjackSession{}, redis.TxFailedErr
}

func (store *BlackjackStore) ApplyAction(ctx context.Context, userID, gameID, action string) (blackjackSession, error) {
	key := blackjackGameKey(gameID)
	var updated blackjackSession
	for attempts := 0; attempts < 5; attempts++ {
		err := store.redis.Watch(ctx, func(tx *redis.Tx) error {
			value, err := tx.Get(ctx, key).Bytes()
			if err != nil {
				return err
			}
			var session blackjackSession
			if err := json.Unmarshal(value, &session); err != nil {
				return err
			}
			if !applyBlackjackActionToSession(&session, userID, action, time.Now()) {
				return errBlackjackInvalid
			}
			eventType := "game_state"
			if session.Status == "finished" {
				eventType = "game_result"
			}
			if err := store.writeSession(ctx, tx, session, false, eventType); err != nil {
				return err
			}
			updated = session
			return nil
		}, key)
		if !errors.Is(err, redis.TxFailedErr) {
			return updated, err
		}
	}
	return blackjackSession{}, redis.TxFailedErr
}

func (store *BlackjackStore) writeSession(ctx context.Context, tx *redis.Tx, session blackjackSession, createIndexes bool, eventType string) error {
	value, err := json.Marshal(session)
	if err != nil {
		return err
	}
	eventPayload, err := json.Marshal(blackjackEventEnvelope{
		PlayerIDs: session.PlayerIDs,
		Event: websocketEvent{
			Type:    eventType,
			Payload: blackjackState(session),
		},
	})
	if err != nil {
		return err
	}
	_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		pipe.Set(ctx, blackjackGameKey(session.GameID), value, blackjackSessionTTL)
		pipe.Publish(ctx, blackjackEventsChannel, eventPayload)
		if session.Status == "playing" {
			pipe.ZAdd(ctx, blackjackDeadlineKey, redis.Z{Score: float64(session.LastActionAt.Add(blackjackIdleTimeout).UnixMilli()), Member: session.GameID})
		} else {
			pipe.ZRem(ctx, blackjackDeadlineKey, session.GameID)
		}
		for _, playerID := range session.PlayerIDs {
			indexKey := blackjackUserGamesKey(playerID)
			if createIndexes {
				pipe.ZAdd(ctx, indexKey, redis.Z{Score: float64(session.CreatedAt.UnixMilli()), Member: session.GameID})
			}
			pipe.Expire(ctx, indexKey, blackjackIndexTTL)
		}
		return nil
	})
	return err
}

func (store *BlackjackStore) ListForUser(ctx context.Context, userID string) ([]blackjackSession, error) {
	indexKey := blackjackUserGamesKey(userID)
	gameIDs, err := store.redis.ZRevRange(ctx, indexKey, 0, -1).Result()
	if err != nil || len(gameIDs) == 0 {
		return nil, err
	}
	keys := make([]string, len(gameIDs))
	for index, gameID := range gameIDs {
		keys[index] = blackjackGameKey(gameID)
	}
	values, err := store.redis.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}
	sessions := make([]blackjackSession, 0, len(values))
	staleIDs := make([]interface{}, 0)
	for index, value := range values {
		if value == nil {
			staleIDs = append(staleIDs, gameIDs[index])
			continue
		}
		text, ok := value.(string)
		if !ok {
			return nil, fmt.Errorf("invalid blackjack session value")
		}
		var session blackjackSession
		if err := json.Unmarshal([]byte(text), &session); err != nil {
			return nil, err
		}
		if session.Status == "playing" || session.Status == "finished" || session.Status == "canceled" {
			sessions = append(sessions, session)
		}
	}
	if len(staleIDs) > 0 {
		store.redis.ZRem(ctx, indexKey, staleIDs...)
	}
	return sessions, nil
}

func (store *BlackjackStore) ExpireDue(ctx context.Context, now time.Time) ([]blackjackSession, error) {
	expired := make([]blackjackSession, 0)
	for {
		gameIDs, err := store.redis.ZRangeByScore(ctx, blackjackDeadlineKey, &redis.ZRangeBy{
			Min: "-inf", Max: fmt.Sprintf("%d", now.UnixMilli()), Offset: 0, Count: 100,
		}).Result()
		if err != nil {
			return expired, err
		}
		for _, gameID := range gameIDs {
			session, didExpire, err := store.expireGame(ctx, gameID, now)
			if err != nil && !errors.Is(err, redis.Nil) {
				return expired, err
			}
			if didExpire {
				expired = append(expired, session)
			}
		}
		if len(gameIDs) < 100 {
			return expired, nil
		}
	}
}

func (store *BlackjackStore) expireGame(ctx context.Context, gameID string, now time.Time) (blackjackSession, bool, error) {
	key := blackjackGameKey(gameID)
	var expired blackjackSession
	for attempts := 0; attempts < 3; attempts++ {
		didExpire := false
		err := store.redis.Watch(ctx, func(tx *redis.Tx) error {
			value, err := tx.Get(ctx, key).Bytes()
			if errors.Is(err, redis.Nil) {
				_, cleanupErr := tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
					pipe.ZRem(ctx, blackjackDeadlineKey, gameID)
					return nil
				})
				return cleanupErr
			}
			if err != nil {
				return err
			}
			var session blackjackSession
			if err := json.Unmarshal(value, &session); err != nil {
				return err
			}
			if session.Status != "playing" {
				_, cleanupErr := tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
					pipe.ZRem(ctx, blackjackDeadlineKey, gameID)
					return nil
				})
				return cleanupErr
			}
			if session.LastActionAt.Add(blackjackIdleTimeout).After(now) {
				_, refreshErr := tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
					pipe.ZAdd(ctx, blackjackDeadlineKey, redis.Z{Score: float64(session.LastActionAt.Add(blackjackIdleTimeout).UnixMilli()), Member: gameID})
					return nil
				})
				return refreshErr
			}
			session.Status, session.Winner, session.CurrentTurn = "canceled", "", ""
			session.Revision++
			if err := store.writeSession(ctx, tx, session, false, "game_result"); err != nil {
				return err
			}
			expired, didExpire = session, true
			return nil
		}, key)
		if errors.Is(err, redis.TxFailedErr) {
			continue
		}
		return expired, didExpire, err
	}
	return blackjackSession{}, false, redis.TxFailedErr
}
