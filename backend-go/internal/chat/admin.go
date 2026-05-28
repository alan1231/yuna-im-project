package chat

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type adminServer struct {
	mongo      *mongo.Client
	redis      *redis.Client
	adminToken string
}

type adminStatsResponse struct {
	UsersTotal            int64     `json:"users_total"`
	UsersOnline           int64     `json:"users_online"`
	MessagesTotal         int64     `json:"messages_total"`
	FriendRequestsPending int64     `json:"friend_requests_pending"`
	FriendsTotal          int64     `json:"friends_total"`
	RedisOnlineKeys       int64     `json:"redis_online_keys"`
	CheckedAt             time.Time `json:"checked_at"`
}

type adminUserResponse struct {
	UserID      string    `json:"user_id" bson:"user_id"`
	DisplayName string    `json:"display_name" bson:"display_name"`
	CreatedAt   time.Time `json:"created_at" bson:"created_at"`
	Online      bool      `json:"online" bson:"online"`
	LastSeen    time.Time `json:"last_seen" bson:"last_seen"`
}

// registerAdminRoutes keeps the management surface separate from the user chat
// API. The first version is read-only: stats and users.
func registerAdminRoutes(mux *http.ServeMux, client *mongo.Client, redisClient *redis.Client, adminToken string) {
	admin := &adminServer{
		mongo:      client,
		redis:      redisClient,
		adminToken: strings.TrimSpace(adminToken),
	}

	mux.HandleFunc("/admin/stats", admin.withAdminAuth(admin.handleStats))
	mux.HandleFunc("/admin/users", admin.withAdminAuth(admin.handleUsers))
}

// withAdminAuth is a lightweight token gate for demo/admin usage. A production
// version should replace this with real admin login, sessions/JWT, and roles.
func (admin *adminServer) withAdminAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		applyCORS(w)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if admin.adminToken != "" && !adminTokenMatches(r, admin.adminToken) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}

func adminTokenMatches(r *http.Request, expected string) bool {
	token := strings.TrimSpace(r.Header.Get("X-Admin-Token"))
	if token == "" {
		auth := strings.TrimSpace(r.Header.Get("Authorization"))
		token = strings.TrimPrefix(auth, "Bearer ")
	}

	return token == expected
}

// handleStats combines durable counts from MongoDB with live presence from
// Redis. That avoids showing stale Mongo online flags in the dashboard.
func (admin *adminServer) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()
	db := admin.mongo.Database(databaseName)

	usersTotal, err := db.Collection(usersName).CountDocuments(ctx, bson.M{})
	if err != nil {
		log.Printf("admin users count failed: %v", err)
		http.Error(w, "count users failed", http.StatusInternalServerError)
		return
	}

	messagesTotal, err := db.Collection(collectionName).CountDocuments(ctx, bson.M{})
	if err != nil {
		log.Printf("admin messages count failed: %v", err)
		http.Error(w, "count messages failed", http.StatusInternalServerError)
		return
	}

	pendingRequests, err := db.Collection(friendRequestsName).CountDocuments(ctx, bson.M{"status": "pending"})
	if err != nil {
		log.Printf("admin pending friend requests count failed: %v", err)
		http.Error(w, "count friend requests failed", http.StatusInternalServerError)
		return
	}

	friendsTotal, err := db.Collection(friendsName).CountDocuments(ctx, bson.M{})
	if err != nil {
		log.Printf("admin friends count failed: %v", err)
		http.Error(w, "count friends failed", http.StatusInternalServerError)
		return
	}

	redisOnlineKeys, err := admin.countRedisOnlineKeys(ctx)
	if err != nil {
		log.Printf("admin redis online keys count failed: %v", err)
		http.Error(w, "count redis presence failed", http.StatusInternalServerError)
		return
	}

	writeJSON(w, adminStatsResponse{
		UsersTotal:            usersTotal,
		UsersOnline:           redisOnlineKeys,
		MessagesTotal:         messagesTotal,
		FriendRequestsPending: pendingRequests,
		FriendsTotal:          friendsTotal,
		RedisOnlineKeys:       redisOnlineKeys,
		CheckedAt:             time.Now(),
	})
}

// handleUsers overlays Redis presence onto Mongo user documents so the admin
// table shows the same online source used by the stats card.
func (admin *adminServer) handleUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit := parseAdminLimit(r.URL.Query().Get("limit"), 100, 500)
	onlineOnly := r.URL.Query().Get("online") == "true"
	filter := bson.M{}
	if query := strings.TrimSpace(r.URL.Query().Get("q")); query != "" {
		filter["$or"] = bson.A{
			bson.M{"user_id": bson.M{"$regex": query, "$options": "i"}},
			bson.M{"display_name": bson.M{"$regex": query, "$options": "i"}},
		}
	}

	onlineUserIDs, err := admin.redisOnlineUserIDs(r.Context())
	if err != nil {
		log.Printf("admin redis online users failed: %v", err)
		http.Error(w, "list redis presence failed", http.StatusInternalServerError)
		return
	}
	if onlineOnly {
		if len(onlineUserIDs) == 0 {
			writeJSON(w, []adminUserResponse{})
			return
		}
		filter["user_id"] = bson.M{"$in": mapKeys(onlineUserIDs)}
	}

	cursor, err := admin.mongo.Database(databaseName).Collection(usersName).Find(
		r.Context(),
		filter,
		options.Find().
			SetSort(bson.D{{Key: "created_at", Value: -1}}).
			SetLimit(int64(limit)),
	)
	if err != nil {
		log.Printf("admin users list failed: %v", err)
		http.Error(w, "list users failed", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(r.Context())

	users := []adminUserResponse{}
	if err := cursor.All(r.Context(), &users); err != nil {
		log.Printf("admin users decode failed: %v", err)
		http.Error(w, "decode users failed", http.StatusInternalServerError)
		return
	}
	for index := range users {
		users[index].Online = onlineUserIDs[users[index].UserID]
	}

	writeJSON(w, users)
}

func (admin *adminServer) countRedisOnlineKeys(ctx context.Context) (int64, error) {
	var count int64
	iter := admin.redis.Scan(ctx, 0, "presence:*:online", 0).Iterator()
	for iter.Next(ctx) {
		count++
	}
	if err := iter.Err(); err != nil {
		return 0, err
	}

	return count, nil
}

// redisOnlineUserIDs converts Redis presence keys back to user IDs for display
// and for the "online only" filter.
func (admin *adminServer) redisOnlineUserIDs(ctx context.Context) (map[string]bool, error) {
	userIDs := map[string]bool{}
	iter := admin.redis.Scan(ctx, 0, "presence:*:online", 0).Iterator()
	for iter.Next(ctx) {
		userID := strings.TrimPrefix(iter.Val(), "presence:")
		userID = strings.TrimSuffix(userID, ":online")
		if userID != "" {
			userIDs[userID] = true
		}
	}
	if err := iter.Err(); err != nil {
		return nil, err
	}

	return userIDs, nil
}

func mapKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}

	return keys
}

func parseAdminLimit(raw string, fallback int, max int) int {
	limit, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || limit <= 0 {
		return fallback
	}
	if limit > max {
		return max
	}

	return limit
}

func writeJSON(w http.ResponseWriter, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("JSON response failed: %v", err)
	}
}
