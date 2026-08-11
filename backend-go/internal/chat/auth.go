package chat

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"
)

const (
	sessionTTL  = 30 * 24 * time.Hour
	wsTicketTTL = time.Minute
)

type sessionAuthenticator func(context.Context, string) (string, error)

var errAuthenticationUnavailable = errors.New("authentication unavailable")

type authenticatedUserContextKey struct{}

func withSessionAuth(authenticate sessionAuthenticator, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		applyCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		token, err := bearerToken(r.Header.Get("Authorization"))
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		userID, err := authenticate(r.Context(), token)
		if errors.Is(err, errAuthenticationUnavailable) {
			http.Error(w, "authentication temporarily unavailable", http.StatusServiceUnavailable)
			return
		}
		if err != nil || strings.TrimSpace(userID) == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), authenticatedUserContextKey{}, userID)
		next(w, r.WithContext(ctx))
	}
}

func bearerToken(header string) (string, error) {
	parts := strings.Fields(header)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", errors.New("missing bearer token")
	}
	return parts[1], nil
}

func authenticatedUserID(r *http.Request) string {
	userID, _ := r.Context().Value(authenticatedUserContextKey{}).(string)
	return userID
}

type SessionStore struct {
	redis *redis.Client
}

func NewSessionStore(redisClient *redis.Client) *SessionStore {
	return &SessionStore{redis: redisClient}
}

func (store *SessionStore) Create(ctx context.Context, userID string) (string, error) {
	token, err := randomToken()
	if err != nil {
		return "", err
	}
	if err := store.redis.Set(ctx, sessionKey(token), userID, sessionTTL).Err(); err != nil {
		return "", err
	}
	return token, nil
}

func (store *SessionStore) Authenticate(ctx context.Context, token string) (string, error) {
	return store.redis.Get(ctx, sessionKey(token)).Result()
}

func (store *SessionStore) Delete(ctx context.Context, token string) error {
	return store.redis.Del(ctx, sessionKey(token)).Err()
}

type wsTicketValue struct {
	UserID     string `json:"user_id"`
	SessionKey string `json:"session_key"`
}

func (store *SessionStore) CreateWSTicket(ctx context.Context, userID string, sessionToken string) (string, error) {
	ticket, err := randomToken()
	if err != nil {
		return "", err
	}
	value, err := json.Marshal(wsTicketValue{UserID: userID, SessionKey: sessionKey(sessionToken)})
	if err != nil {
		return "", err
	}
	if err := store.redis.Set(ctx, wsTicketKey(ticket), value, wsTicketTTL).Err(); err != nil {
		return "", err
	}
	return ticket, nil
}

func (store *SessionStore) ConsumeWSTicket(ctx context.Context, ticket string) (string, error) {
	if strings.TrimSpace(ticket) == "" {
		return "", errors.New("missing websocket ticket")
	}
	key := wsTicketKey(ticket)
	value, err := store.redis.GetDel(ctx, key).Bytes()
	if err != nil {
		return "", err
	}
	var ticketValue wsTicketValue
	if err := json.Unmarshal(value, &ticketValue); err != nil {
		return "", err
	}
	if exists, err := store.redis.Exists(ctx, ticketValue.SessionKey).Result(); err != nil || exists != 1 {
		return "", errors.New("websocket session expired")
	}
	return ticketValue.UserID, nil
}

func (store *SessionStore) AllowAuthAttempt(ctx context.Context, kind string, identity string, limit int) (bool, error) {
	key := authAttemptKey(kind, identity, time.Now())
	count, err := store.redis.Incr(ctx, key).Result()
	if err != nil {
		return false, err
	}
	if count == 1 {
		store.redis.Expire(ctx, key, 2*time.Minute)
	}
	return count <= int64(limit), nil
}

func authAttemptKey(kind string, identity string, now time.Time) string {
	digest := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(identity))))
	return fmt.Sprintf("auth:attempt:%s:%d:%x", kind, now.Unix()/60, digest[:16])
}

func sessionKey(token string) string {
	return hashedTokenKey("auth:session:", token)
}

func wsTicketKey(ticket string) string {
	return hashedTokenKey("auth:ws-ticket:", ticket)
}

func hashedTokenKey(prefix string, token string) string {
	digest := sha256.Sum256([]byte(token))
	return prefix + hex.EncodeToString(digest[:])
}

func randomToken() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func validateCredentials(displayName string, password string) error {
	displayName = strings.TrimSpace(displayName)
	if displayName == "" || len([]rune(displayName)) > 32 {
		return errors.New("display_name must be between 1 and 32 characters")
	}
	if len(password) < 8 || len([]byte(password)) > 72 {
		return errors.New("password must be between 8 and 72 bytes")
	}
	return nil
}

func normalizeLoginName(displayName string) string {
	return strings.ToLower(strings.TrimSpace(displayName))
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	remoteIP := net.ParseIP(host)
	if remoteIP != nil && (remoteIP.IsPrivate() || remoteIP.IsLoopback()) {
		parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		for index := len(parts) - 1; index >= 0; index-- {
			forwarded := strings.TrimSpace(parts[index])
			if net.ParseIP(forwarded) != nil {
				return forwarded
			}
		}
	}
	return host
}

func allowCredentialsAttempt(w http.ResponseWriter, r *http.Request, sessions *SessionStore, displayName string) bool {
	for _, check := range []struct {
		kind     string
		identity string
		limit    int
	}{
		{kind: "ip", identity: clientIP(r), limit: 30},
		{kind: "account", identity: normalizeLoginName(displayName), limit: 10},
	} {
		allowed, err := sessions.AllowAuthAttempt(r.Context(), check.kind, check.identity, check.limit)
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

func hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}

func passwordMatches(hash string, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

type credentialsRequest struct {
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
}

type authUser struct {
	UserID       string    `bson:"user_id"`
	DisplayName  string    `bson:"display_name"`
	LoginName    string    `bson:"login_name"`
	PasswordHash string    `bson:"password_hash"`
	CreatedAt    time.Time `bson:"created_at"`
	Online       bool      `bson:"online"`
	LastSeen     time.Time `bson:"last_seen"`
}

type authResponse struct {
	Token string       `json:"token"`
	User  userResponse `json:"user"`
}

func handleRegister(w http.ResponseWriter, r *http.Request, client *mongo.Client, sessions *SessionStore) {
	applyCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req credentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if err := validateCredentials(req.DisplayName, req.Password); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !allowCredentialsAttempt(w, r, sessions, req.DisplayName) {
		return
	}

	users := client.Database(databaseName).Collection(usersName)
	loginName := normalizeLoginName(req.DisplayName)
	var user authUser
	lookupErr := users.FindOne(r.Context(), bson.M{"login_name": loginName}).Decode(&user)
	if lookupErr == nil {
		http.Error(w, "display name already registered", http.StatusConflict)
		return
	}
	if !errors.Is(lookupErr, mongo.ErrNoDocuments) {
		http.Error(w, "lookup user failed", http.StatusInternalServerError)
		return
	}
	legacyCount, err := users.CountDocuments(r.Context(), bson.M{"display_name": bson.M{
		"$regex": "^" + regexp.QuoteMeta(req.DisplayName) + "$", "$options": "i",
	}})
	if err != nil {
		http.Error(w, "lookup user failed", http.StatusInternalServerError)
		return
	}
	if legacyCount > 0 {
		http.Error(w, "existing account requires administrator password setup", http.StatusConflict)
		return
	}

	hash, err := hashPassword(req.Password)
	if err != nil {
		http.Error(w, "hash password failed", http.StatusInternalServerError)
		return
	}
	now := time.Now()
	userIDToken, tokenErr := randomToken()
	if tokenErr != nil {
		http.Error(w, "create user failed", http.StatusInternalServerError)
		return
	}
	user = authUser{
		UserID: userIDToken[:22], DisplayName: req.DisplayName, LoginName: loginName,
		PasswordHash: hash, CreatedAt: now, LastSeen: now,
	}
	if _, err := users.InsertOne(r.Context(), user); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			http.Error(w, "display name already registered", http.StatusConflict)
			return
		}
		http.Error(w, "create user failed", http.StatusInternalServerError)
		return
	}

	writeAuthResponse(w, r, sessions, user)
}

func handleLogin(w http.ResponseWriter, r *http.Request, client *mongo.Client, sessions *SessionStore) {
	applyCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req credentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if err := validateCredentials(req.DisplayName, req.Password); err != nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if !allowCredentialsAttempt(w, r, sessions, req.DisplayName) {
		return
	}

	var user authUser
	err := client.Database(databaseName).Collection(usersName).FindOne(r.Context(), bson.M{
		"login_name": normalizeLoginName(req.DisplayName),
	}).Decode(&user)
	if err != nil || user.PasswordHash == "" || !passwordMatches(user.PasswordHash, req.Password) {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	writeAuthResponse(w, r, sessions, user)
}

func writeAuthResponse(w http.ResponseWriter, r *http.Request, sessions *SessionStore, user authUser) {
	token, err := sessions.Create(r.Context(), user.UserID)
	if err != nil {
		http.Error(w, "create session failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(authResponse{Token: token, User: userResponse{
		UserID: user.UserID, DisplayName: user.DisplayName, CreatedAt: user.CreatedAt,
		Online: user.Online, LastSeen: user.LastSeen,
	}}); err != nil {
		log.Printf("登入回應 JSON 失敗: %v", err)
	}
}

func handleLogout(w http.ResponseWriter, r *http.Request, sessions *SessionStore) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token, _ := bearerToken(r.Header.Get("Authorization"))
	if err := sessions.Delete(r.Context(), token); err != nil {
		http.Error(w, "logout failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleMe(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var user userResponse
	if err := client.Database(databaseName).Collection(usersName).FindOne(
		r.Context(), bson.M{"user_id": authenticatedUserID(r)},
	).Decode(&user); err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func handleWSTicket(w http.ResponseWriter, r *http.Request, sessions *SessionStore) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	allowed, err := sessions.AllowAuthAttempt(r.Context(), "ws-ticket", authenticatedUserID(r), 30)
	if err != nil {
		http.Error(w, "websocket authentication temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	if !allowed {
		http.Error(w, "too many websocket tickets", http.StatusTooManyRequests)
		return
	}
	sessionToken, _ := bearerToken(r.Header.Get("Authorization"))
	ticket, err := sessions.CreateWSTicket(r.Context(), authenticatedUserID(r), sessionToken)
	if err != nil {
		http.Error(w, "create websocket ticket failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ticket": ticket})
}
