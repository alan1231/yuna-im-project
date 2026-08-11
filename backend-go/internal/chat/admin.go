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
// API. It exposes stats, user listing, and admin-only user deletion.
func registerAdminRoutes(mux *http.ServeMux, client *mongo.Client, redisClient *redis.Client, adminToken string) {
	admin := &adminServer{
		mongo:      client,
		redis:      redisClient,
		adminToken: strings.TrimSpace(adminToken),
	}

	mux.HandleFunc("/admin/stats", admin.withAdminAuth(admin.handleStats))
	mux.HandleFunc("/admin/users", admin.withAdminAuth(admin.handleUsers))
	mux.HandleFunc("/admin/users/set-password", admin.withAdminAuth(admin.handleSetUserPassword))
}

type setUserPasswordRequest struct {
	UserID   string `json:"user_id"`
	Password string `json:"password"`
}

func (admin *adminServer) handleSetUserPassword(w http.ResponseWriter, r *http.Request) {
	if admin.adminToken == "" {
		http.Error(w, "ADMIN_TOKEN is required", http.StatusServiceUnavailable)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req setUserPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	req.UserID = strings.TrimSpace(req.UserID)
	var user authUser
	users := admin.mongo.Database(databaseName).Collection(usersName)
	if err := users.FindOne(r.Context(), bson.M{"user_id": req.UserID}).Decode(&user); err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if err := validateCredentials(user.DisplayName, req.Password); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	hash, err := hashPassword(req.Password)
	if err != nil {
		http.Error(w, "hash password failed", http.StatusInternalServerError)
		return
	}
	result, err := users.UpdateOne(r.Context(), bson.M{
		"user_id": req.UserID, "password_hash": bson.M{"$in": bson.A{"", nil}},
	}, bson.M{"$set": bson.M{
		"login_name": normalizeLoginName(user.DisplayName), "password_hash": hash, "updated_at": time.Now(),
	}})
	if mongo.IsDuplicateKeyError(err) {
		http.Error(w, "duplicate login name", http.StatusConflict)
		return
	}
	if err != nil {
		http.Error(w, "set password failed", http.StatusInternalServerError)
		return
	}
	if result.ModifiedCount != 1 {
		http.Error(w, "password already configured", http.StatusConflict)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
	switch r.Method {
	case http.MethodGet:
		// continue below
	case http.MethodDelete:
		admin.handleDeleteUser(w, r)
		return
	default:
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

func (admin *adminServer) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	if userID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	db := admin.mongo.Database(databaseName)

	if _, err := db.Collection(collectionName).DeleteMany(ctx, bson.M{
		"$or": bson.A{
			bson.M{"sender_id": userID},
			bson.M{"recipient_id": userID},
		},
	}); err != nil {
		log.Printf("admin delete user messages failed: %v", err)
		http.Error(w, "delete messages failed", http.StatusInternalServerError)
		return
	}

	if _, err := db.Collection(friendsName).DeleteMany(ctx, bson.M{
		"$or": bson.A{
			bson.M{"user_id": userID},
			bson.M{"friend_id": userID},
		},
	}); err != nil {
		log.Printf("admin delete user friends failed: %v", err)
		http.Error(w, "delete friends failed", http.StatusInternalServerError)
		return
	}

	if _, err := db.Collection(friendRequestsName).DeleteMany(ctx, bson.M{
		"$or": bson.A{
			bson.M{"from_user_id": userID},
			bson.M{"to_user_id": userID},
		},
	}); err != nil {
		log.Printf("admin delete user friend requests failed: %v", err)
		http.Error(w, "delete friend requests failed", http.StatusInternalServerError)
		return
	}

	cursor, err := db.Collection(groupsName).Find(ctx, bson.M{"member_ids": userID})
	if err != nil {
		log.Printf("admin load user groups failed: %v", err)
		http.Error(w, "load groups failed", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var group groupResponse
		if err := cursor.Decode(&group); err != nil {
			log.Printf("admin decode user group failed: %v", err)
			continue
		}

		nextMembers := removeString(group.MemberIDs, userID)
		if len(nextMembers) == 0 {
			if _, err := db.Collection(groupsName).DeleteOne(ctx, bson.M{"group_id": group.GroupID}); err != nil {
				log.Printf("admin delete empty group failed: %v", err)
				http.Error(w, "delete group failed", http.StatusInternalServerError)
				return
			}
			continue
		}

		if _, err := db.Collection(groupsName).UpdateOne(
			ctx,
			bson.M{"group_id": group.GroupID},
			bson.M{"$set": bson.M{"member_ids": nextMembers}},
		); err != nil {
			log.Printf("admin update group members failed: %v", err)
			http.Error(w, "update group failed", http.StatusInternalServerError)
			return
		}
	}
	if err := cursor.Err(); err != nil {
		log.Printf("admin iterate user groups failed: %v", err)
		http.Error(w, "iterate groups failed", http.StatusInternalServerError)
		return
	}

	if _, err := db.Collection(usersName).DeleteOne(ctx, bson.M{"user_id": userID}); err != nil {
		log.Printf("admin delete user failed: %v", err)
		http.Error(w, "delete user failed", http.StatusInternalServerError)
		return
	}

	if err := admin.redis.Del(ctx, presenceConnectionsKey(userID), presenceOnlineKey(userID)).Err(); err != nil {
		log.Printf("admin delete redis presence failed: %v", err)
	}

	w.WriteHeader(http.StatusNoContent)
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

func removeString(values []string, target string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == target {
			continue
		}
		result = append(result, value)
	}

	return result
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
