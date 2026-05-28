package chat

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

const presenceTTL = 90 * time.Second

// PresenceStore keeps short-lived online state in Redis and mirrors a durable
// snapshot to MongoDB for user lists. Redis is the source of truth for admin
// real-time presence.
type PresenceStore struct {
	redis *redis.Client
	mongo *mongo.Client
}

func NewPresenceStore(redisClient *redis.Client, mongoClient *mongo.Client) *PresenceStore {
	return &PresenceStore{
		redis: redisClient,
		mongo: mongoClient,
	}
}

// Connect increments the per-user WebSocket connection count. A user becomes
// online only when the first active connection is established.
func (store *PresenceStore) Connect(ctx context.Context, userID string) error {
	count, err := store.redis.Incr(ctx, presenceConnectionsKey(userID)).Result()
	if err != nil {
		return err
	}

	if err := store.refresh(ctx, userID); err != nil {
		return err
	}

	if count == 1 {
		store.setMongoPresence(ctx, userID, true)
	}

	return nil
}

// Disconnect decrements connection count and marks offline only after the last
// tab/device disconnects.
func (store *PresenceStore) Disconnect(ctx context.Context, userID string) {
	count, err := store.redis.Decr(ctx, presenceConnectionsKey(userID)).Result()
	if err != nil {
		log.Printf("Redis 使用者連線數更新失敗: %v", err)
		store.setMongoPresence(ctx, userID, false)
		return
	}

	if count <= 0 {
		if err := store.redis.Del(ctx, presenceConnectionsKey(userID), presenceOnlineKey(userID)).Err(); err != nil {
			log.Printf("Redis 使用者在線狀態刪除失敗: %v", err)
		}
		store.setMongoPresence(ctx, userID, false)
		return
	}

	if err := store.refresh(ctx, userID); err != nil {
		log.Printf("Redis 使用者在線狀態續期失敗: %v", err)
	}
}

// KeepAlive refreshes Redis TTLs so a process crash eventually clears stale
// online state without relying on WebSocket cleanup handlers.
func (store *PresenceStore) KeepAlive(ctx context.Context, userID string) {
	ticker := time.NewTicker(presenceTTL / 3)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := store.refresh(ctx, userID); err != nil {
				log.Printf("Redis 使用者在線狀態續期失敗: %v", err)
			}
		}
	}
}

// refresh writes both the online marker and the connection counter TTL in one
// pipeline to keep presence keys expiring together.
func (store *PresenceStore) refresh(ctx context.Context, userID string) error {
	pipe := store.redis.Pipeline()
	pipe.Set(ctx, presenceOnlineKey(userID), "1", presenceTTL)
	pipe.Expire(ctx, presenceConnectionsKey(userID), presenceTTL)
	_, err := pipe.Exec(ctx)
	return err
}

// setMongoPresence is a secondary snapshot for normal user/friend lists. It is
// not used as the admin source of truth because stale values can survive crashes.
func (store *PresenceStore) setMongoPresence(ctx context.Context, userID string, online bool) {
	update := bson.M{
		"$set": bson.M{
			"online":    online,
			"last_seen": time.Now(),
		},
	}
	if online {
		update = bson.M{
			"$set": bson.M{
				"online": online,
			},
		}
	}

	_, err := store.mongo.Database(databaseName).Collection(usersName).
		UpdateOne(ctx, bson.M{"user_id": userID}, update)
	if err != nil {
		log.Printf("更新使用者在線狀態失敗: %v", err)
	}
}

func presenceConnectionsKey(userID string) string {
	return fmt.Sprintf("presence:%s:connections", userID)
}

func presenceOnlineKey(userID string) string {
	return fmt.Sprintf("presence:%s:online", userID)
}
