package chat

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
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
	sessions   *SessionStore
	presence   *PresenceStore
	hub        *changeStreamHub
	adminToken string
}

type authenticatedAdminContextKey struct{}

type adminCredentialsRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type adminAccount struct {
	ID           interface{} `bson:"_id,omitempty"`
	Username     string      `bson:"username"`
	PasswordHash string      `bson:"password_hash"`
	Token        string      `bson:"token"`
	CreatedAt    time.Time   `bson:"created_at"`
	UpdatedAt    time.Time   `bson:"updated_at"`
}

type adminAccountResponse struct {
	Username string `json:"username"`
}

type adminLoginResponse struct {
	Token string               `json:"token"`
	Admin adminAccountResponse `json:"admin"`
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
	Disabled    bool      `json:"disabled" bson:"disabled"`
}

type adminUsersResponse struct {
	Items  []adminUserResponse `json:"items"`
	Total  int64               `json:"total"`
	Offset int                 `json:"offset"`
	Limit  int                 `json:"limit"`
}

type adminAuditLog struct {
	AdminUsername string    `json:"admin_username" bson:"admin_username"`
	Action        string    `json:"action" bson:"action"`
	Result        string    `json:"result" bson:"result"`
	TargetUserID  string    `json:"target_user_id" bson:"target_user_id"`
	TargetName    string    `json:"target_name,omitempty" bson:"target_name,omitempty"`
	CreatedAt     time.Time `json:"created_at" bson:"created_at"`
}

type adminUserActionRequest struct {
	UserID   string `json:"user_id"`
	Disabled bool   `json:"disabled"`
}

// registerAdminRoutes keeps the management surface separate from the user chat
// API. It exposes login, stats, user listing, password setup, and admin-only
// user deletion. The ADMIN_TOKEN env value is only used to bootstrap the first
// admin account through /admin/setup; afterwards authentication is a stored
// token issued by /admin/login.
func registerAdminRoutes(mux *http.ServeMux, client *mongo.Client, redisClient *redis.Client, sessions *SessionStore, presence *PresenceStore, hub *changeStreamHub, adminToken string) {
	admin := &adminServer{
		mongo:      client,
		redis:      redisClient,
		sessions:   sessions,
		presence:   presence,
		hub:        hub,
		adminToken: strings.TrimSpace(adminToken),
	}

	mux.HandleFunc("/admin/login", admin.handleLogin)
	mux.HandleFunc("/admin/setup", admin.withBootstrapAuth(admin.handleSetup))
	mux.HandleFunc("/admin/logout", admin.withAdminAuth(admin.handleLogout))
	mux.HandleFunc("/admin/stats", admin.withAdminAuth(admin.handleStats))
	mux.HandleFunc("/admin/users", admin.withAdminAuth(admin.handleUsers))
	mux.HandleFunc("/admin/users/set-password", admin.withAdminAuth(admin.handleSetUserPassword))
	mux.HandleFunc("/admin/users/status", admin.withAdminAuth(admin.handleUserStatus))
	mux.HandleFunc("/admin/users/logout", admin.withAdminAuth(admin.handleForceUserLogout))
	mux.HandleFunc("/admin/audit-logs", admin.withAdminAuth(admin.handleAuditLogs))
}

type setUserPasswordRequest struct {
	UserID   string `json:"user_id"`
	Password string `json:"password"`
}

func (admin *adminServer) handleSetUserPassword(w http.ResponseWriter, r *http.Request) {
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
	if err := users.FindOne(r.Context(), bson.M{"user_id": req.UserID}).Decode(&user); errors.Is(err, mongo.ErrNoDocuments) {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	} else if err != nil {
		log.Printf("admin user lookup failed: %v", err)
		http.Error(w, "load user failed", http.StatusInternalServerError)
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

// withAdminAuth validates the request against the admin token stored in the
// admins collection. Unlike the old env-var token gate, admins obtain a new
// token by signing in through POST /admin/login.
func (admin *adminServer) withAdminAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		applyCORS(w)
		w.Header().Set("Cache-Control", "no-store")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		token := adminTokenFromRequest(r)
		if strings.TrimSpace(token) == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var account adminAccount
		err := admin.mongo.Database(databaseName).Collection(adminsName).FindOne(
			r.Context(), bson.M{"token": token},
		).Decode(&account)
		if err == nil && account.Username == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, mongo.ErrNoDocuments) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if err != nil {
			log.Printf("admin auth lookup failed: %v", err)
			http.Error(w, "admin authentication temporarily unavailable", http.StatusServiceUnavailable)
			return
		}

		ctx := context.WithValue(r.Context(), authenticatedAdminContextKey{}, account.Username)
		next(w, r.WithContext(ctx))
	}
}

// withBootstrapAuth gates POST /admin/setup with the ADMIN_TOKEN env value so
// the first admin account can be created before any database admin exists.
func (admin *adminServer) withBootstrapAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		applyCORS(w)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if admin.adminToken == "" {
			http.Error(w, "ADMIN_TOKEN is required", http.StatusServiceUnavailable)
			return
		}
		if adminTokenFromRequest(r) != admin.adminToken {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}

// handleSetup creates the first admin account using the ADMIN_TOKEN env value.
func (admin *adminServer) handleSetup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	admins := admin.mongo.Database(databaseName).Collection(adminsName)
	adminCount, err := admins.CountDocuments(r.Context(), bson.M{}, options.Count().SetLimit(1))
	if err != nil {
		log.Printf("admin setup count failed: %v", err)
		http.Error(w, "check admin setup failed", http.StatusInternalServerError)
		return
	}
	if adminCount > 0 {
		http.Error(w, "admin setup already completed", http.StatusConflict)
		return
	}

	var req adminCredentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	username := normalizeLoginName(req.Username)
	if err := validateAdminUsername(username); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(req.Password) < 8 || len([]byte(req.Password)) > 72 {
		http.Error(w, "password must be between 8 and 72 bytes", http.StatusBadRequest)
		return
	}

	hash, err := hashPassword(req.Password)
	if err != nil {
		http.Error(w, "hash password failed", http.StatusInternalServerError)
		return
	}
	account := adminAccount{
		ID:       "primary-admin",
		Username: username, PasswordHash: hash,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if _, err := admins.InsertOne(r.Context(), account); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			http.Error(w, "admin username already exists", http.StatusConflict)
			return
		}
		http.Error(w, "create admin failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// handleLogin validates admin credentials, then issues a fresh token that is
// stored on the admin document for subsequent /admin/* requests.
func (admin *adminServer) handleLogin(w http.ResponseWriter, r *http.Request) {
	applyCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req adminCredentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	username := normalizeLoginName(req.Username)
	if err := validateAdminUsername(username); err != nil {
		http.Error(w, "invalid admin credentials", http.StatusUnauthorized)
		return
	}
	if len(req.Password) < 8 || len([]byte(req.Password)) > 72 {
		http.Error(w, "invalid admin credentials", http.StatusUnauthorized)
		return
	}
	if !admin.allowLoginAttempt(w, r, username) {
		return
	}

	var account adminAccount
	err := admin.mongo.Database(databaseName).Collection(adminsName).FindOne(
		r.Context(), bson.M{"username": username},
	).Decode(&account)
	if err != nil || account.PasswordHash == "" || !passwordMatches(account.PasswordHash, req.Password) {
		http.Error(w, "invalid admin credentials", http.StatusUnauthorized)
		return
	}

	token, err := randomToken()
	if err != nil {
		http.Error(w, "create admin session failed", http.StatusInternalServerError)
		return
	}
	if _, err := admin.mongo.Database(databaseName).Collection(adminsName).UpdateOne(
		r.Context(),
		bson.M{"username": username},
		bson.M{"$set": bson.M{"token": token, "updated_at": time.Now()}},
	); err != nil {
		http.Error(w, "update admin session failed", http.StatusInternalServerError)
		return
	}

	writeJSON(w, adminLoginResponse{
		Token: token,
		Admin: adminAccountResponse{Username: account.Username},
	})
}

// handleLogout removes the stored admin token so it can no longer be used.
func (admin *adminServer) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := adminTokenFromRequest(r)
	if _, err := admin.mongo.Database(databaseName).Collection(adminsName).UpdateOne(
		r.Context(),
		bson.M{"token": token},
		bson.M{"$unset": bson.M{"token": ""}, "$set": bson.M{"updated_at": time.Now()}},
	); err != nil {
		log.Printf("admin logout failed: %v", err)
		http.Error(w, "logout failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// allowLoginAttempt throttles admin sign-in by client IP and by admin username.
func (admin *adminServer) allowLoginAttempt(w http.ResponseWriter, r *http.Request, username string) bool {
	for _, check := range []struct {
		kind     string
		identity string
		limit    int
	}{
		{kind: "admin:ip", identity: clientIP(r), limit: 30},
		{kind: "admin:account", identity: username, limit: 10},
	} {
		allowed, err := admin.sessions.AllowAuthAttempt(r.Context(), check.kind, check.identity, check.limit)
		if err != nil {
			http.Error(w, "authentication temporarily unavailable", http.StatusServiceUnavailable)
			return false
		}
		if !allowed {
			http.Error(w, "too many attempts", http.StatusTooManyRequests)
			return false
		}
	}
	return true
}

func validateAdminUsername(username string) error {
	username = strings.TrimSpace(username)
	if username == "" || len([]rune(username)) > 64 {
		return errors.New("username must be between 1 and 64 characters")
	}
	return nil
}

// adminTokenFromRequest reads the token from X-Admin-Token or the Authorization
// bearer header.
func adminTokenFromRequest(r *http.Request) string {
	token := strings.TrimSpace(r.Header.Get("X-Admin-Token"))
	if token != "" {
		return token
	}
	return strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(r.Header.Get("Authorization")), "Bearer "))
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

	friendRows, err := db.Collection(friendsName).CountDocuments(ctx, bson.M{})
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
		FriendsTotal:          friendRows / 2,
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

	limit := parseAdminLimit(r.URL.Query().Get("limit"), 25, 100)
	offset := parseAdminOffset(r.URL.Query().Get("offset"))
	onlineOnly := r.URL.Query().Get("online") == "true"
	filter := bson.M{}
	query, err := parseAdminSearchQuery(r.URL.Query().Get("q"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if query != "" {
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
			writeJSON(w, adminUsersResponse{Items: []adminUserResponse{}, Limit: limit, Offset: offset})
			return
		}
		filter["user_id"] = bson.M{"$in": mapKeys(onlineUserIDs)}
	}
	total, err := admin.mongo.Database(databaseName).Collection(usersName).CountDocuments(r.Context(), filter)
	if err != nil {
		log.Printf("admin users count failed: %v", err)
		http.Error(w, "count users failed", http.StatusInternalServerError)
		return
	}

	cursor, err := admin.mongo.Database(databaseName).Collection(usersName).Find(
		r.Context(),
		filter,
		options.Find().
			SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}).
			SetSkip(int64(offset)).
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

	writeJSON(w, adminUsersResponse{Items: users, Total: total, Offset: offset, Limit: limit})
}

func (admin *adminServer) handleUserStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req adminUserActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	req.UserID = strings.TrimSpace(req.UserID)
	if req.UserID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	users := admin.mongo.Database(databaseName).Collection(usersName)
	var user authUser
	if err := users.FindOne(r.Context(), bson.M{"user_id": req.UserID}).Decode(&user); errors.Is(err, mongo.ErrNoDocuments) {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "load user failed", http.StatusInternalServerError)
		return
	}

	if !req.Disabled {
		if err := admin.sessions.DeleteAllForUser(r.Context(), req.UserID); err != nil {
			http.Error(w, "revoke sessions failed", http.StatusInternalServerError)
			return
		}
	}
	now := time.Now()
	update := bson.M{"$set": bson.M{"disabled": req.Disabled, "updated_at": now}}
	if req.Disabled {
		update["$set"].(bson.M)["disabled_at"] = now
		update["$set"].(bson.M)["online"] = false
	} else {
		update["$unset"] = bson.M{"disabled_at": ""}
	}
	result, err := users.UpdateOne(r.Context(), bson.M{
		"user_id": req.UserID, "status": bson.M{"$ne": "deleting"},
	}, update)
	if err != nil {
		http.Error(w, "update user status failed", http.StatusInternalServerError)
		return
	}
	if result.MatchedCount == 0 {
		http.Error(w, "user deletion is in progress", http.StatusConflict)
		return
	}

	if req.Disabled {
		if err := admin.terminateUserAccess(r.Context(), req.UserID); err != nil {
			log.Printf("admin disable user cleanup failed: user_id=%s error=%v", req.UserID, err)
			http.Error(w, "user disabled but session cleanup failed", http.StatusInternalServerError)
			return
		}
	}
	action := "user_enabled"
	if req.Disabled {
		action = "user_disabled"
	}
	admin.recordAudit(r, action, "success", user.UserID, user.DisplayName)
	w.WriteHeader(http.StatusNoContent)
}

func (admin *adminServer) handleForceUserLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req adminUserActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	req.UserID = strings.TrimSpace(req.UserID)
	var user authUser
	if err := admin.mongo.Database(databaseName).Collection(usersName).FindOne(
		r.Context(), bson.M{"user_id": req.UserID},
	).Decode(&user); errors.Is(err, mongo.ErrNoDocuments) {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "load user failed", http.StatusInternalServerError)
		return
	}
	if err := admin.terminateUserAccess(r.Context(), req.UserID); err != nil {
		http.Error(w, "force logout failed", http.StatusInternalServerError)
		return
	}
	admin.recordAudit(r, "user_force_logout", "success", user.UserID, user.DisplayName)
	w.WriteHeader(http.StatusNoContent)
}

func (admin *adminServer) handleAuditLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cursor, err := admin.mongo.Database(databaseName).Collection(adminAuditName).Find(
		r.Context(), bson.M{}, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(50),
	)
	if err != nil {
		http.Error(w, "list audit logs failed", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(r.Context())
	logs := []adminAuditLog{}
	if err := cursor.All(r.Context(), &logs); err != nil {
		http.Error(w, "decode audit logs failed", http.StatusInternalServerError)
		return
	}
	writeJSON(w, logs)
}

func (admin *adminServer) terminateUserAccess(ctx context.Context, userID string) error {
	if err := admin.sessions.DeleteAllForUser(ctx, userID); err != nil {
		return err
	}
	admin.hub.disconnectUser(userID)
	return admin.presence.ForceOffline(ctx, userID)
}

func (admin *adminServer) recordAudit(r *http.Request, action, result, userID, displayName string) {
	username, _ := r.Context().Value(authenticatedAdminContextKey{}).(string)
	_, err := admin.mongo.Database(databaseName).Collection(adminAuditName).InsertOne(r.Context(), adminAuditLog{
		AdminUsername: username,
		Action:        action,
		Result:        result,
		TargetUserID:  userID,
		TargetName:    displayName,
		CreatedAt:     time.Now(),
	})
	if err != nil {
		log.Printf("admin audit write failed: action=%s user_id=%s error=%v", action, userID, err)
	}
}

func (admin *adminServer) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	if userID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	db := admin.mongo.Database(databaseName)
	var user authUser
	if err := db.Collection(usersName).FindOneAndUpdate(ctx, bson.M{
		"user_id": userID, "status": bson.M{"$ne": "deleting"},
	}, bson.M{"$set": bson.M{
		"disabled": true, "status": "deleting", "online": false, "updated_at": time.Now(),
	}}, options.FindOneAndUpdate().SetReturnDocument(options.Before)).Decode(&user); errors.Is(err, mongo.ErrNoDocuments) {
		http.Error(w, "user not found or deletion already in progress", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "prepare user deletion failed", http.StatusInternalServerError)
		return
	}
	if err := admin.terminateUserAccess(ctx, userID); err != nil {
		admin.recordAudit(r, "user_deleted", "failed", user.UserID, user.DisplayName)
		http.Error(w, "user disabled but access cleanup failed", http.StatusInternalServerError)
		return
	}

	session, err := admin.mongo.StartSession()
	if err != nil {
		http.Error(w, "start deletion transaction failed", http.StatusInternalServerError)
		return
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(transactionContext mongo.SessionContext) (interface{}, error) {
		return nil, admin.deleteUserMongo(transactionContext, userID)
	})
	if err != nil {
		log.Printf("admin delete user transaction failed: %v", err)
		admin.recordAudit(r, "user_deleted", "failed", user.UserID, user.DisplayName)
		http.Error(w, "delete user failed", http.StatusInternalServerError)
		return
	}
	admin.recordAudit(r, "user_deleted", "success", user.UserID, user.DisplayName)
	w.WriteHeader(http.StatusNoContent)
}

func (admin *adminServer) deleteUserMongo(ctx mongo.SessionContext, userID string) error {
	db := admin.mongo.Database(databaseName)
	if _, err := db.Collection(collectionName).DeleteMany(ctx, bson.M{
		"$or": bson.A{
			bson.M{"sender_id": userID},
			bson.M{"recipient_id": userID},
		},
	}); err != nil {
		return err
	}
	if _, err := db.Collection(collectionName).UpdateMany(ctx, bson.M{"participant_ids": userID}, bson.M{
		"$pull": bson.M{"participant_ids": userID, "read_by": userID},
	}); err != nil {
		return err
	}

	if _, err := db.Collection(friendsName).DeleteMany(ctx, bson.M{
		"$or": bson.A{
			bson.M{"user_id": userID},
			bson.M{"friend_id": userID},
		},
	}); err != nil {
		return err
	}

	if _, err := db.Collection(friendRequestsName).DeleteMany(ctx, bson.M{
		"$or": bson.A{
			bson.M{"from_user_id": userID},
			bson.M{"to_user_id": userID},
		},
	}); err != nil {
		return err
	}

	cursor, err := db.Collection(groupsName).Find(ctx, bson.M{"member_ids": userID})
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var group groupResponse
		if err := cursor.Decode(&group); err != nil {
			return err
		}

		nextMembers := removeString(group.MemberIDs, userID)
		if len(nextMembers) == 0 {
			if _, err := db.Collection(groupsName).DeleteOne(ctx, bson.M{"group_id": group.GroupID}); err != nil {
				return err
			}
			if _, err := db.Collection(collectionName).DeleteMany(ctx, bson.M{"conversation_id": group.ConversationID}); err != nil {
				return err
			}
			if _, err := db.Collection(deletedChatsName).DeleteMany(ctx, bson.M{"conversation_id": group.ConversationID}); err != nil {
				return err
			}
			continue
		}
		set := bson.M{"member_ids": nextMembers}
		if group.CreatedBy == userID {
			set["created_by"] = nextMembers[0]
		}
		if _, err := db.Collection(groupsName).UpdateOne(
			ctx,
			bson.M{"group_id": group.GroupID},
			bson.M{"$set": set},
		); err != nil {
			return err
		}
	}
	if err := cursor.Err(); err != nil {
		return err
	}
	if _, err := db.Collection(deletedChatsName).DeleteMany(ctx, bson.M{"user_id": userID}); err != nil {
		return err
	}
	result, err := db.Collection(usersName).DeleteOne(ctx, bson.M{"user_id": userID, "status": "deleting"})
	if err != nil {
		return err
	}
	if result.DeletedCount != 1 {
		return errors.New("user disappeared during deletion")
	}
	return nil
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

func parseAdminOffset(raw string) int {
	offset, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || offset < 0 {
		return 0
	}
	return offset
}

func parseAdminSearchQuery(raw string) (string, error) {
	query := strings.TrimSpace(raw)
	if len([]rune(query)) > 100 {
		return "", errors.New("search query must be 100 characters or fewer")
	}
	return regexp.QuoteMeta(query), nil
}

func writeJSON(w http.ResponseWriter, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("JSON response failed: %v", err)
	}
}
