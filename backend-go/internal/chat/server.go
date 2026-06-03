package chat

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	collectionName     = "messages"
	usersName          = "users"
	friendsName        = "friends"
	friendRequestsName = "friend_requests"
	stockBotID         = "stock_bot"
)

var databaseName = defaultDatabaseName
var allowedOrigins = defaultAllowedOrigins

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return isOriginAllowed(r.Header.Get("Origin"))
	},
}

type wsClient struct {
	userID string
	send   chan websocketEvent

	mu                   sync.RWMutex
	activeConversationID string
}

func newWSClient(userID string, conversationID string) *wsClient {
	return &wsClient{
		userID:               userID,
		activeConversationID: conversationID,
		send:                 make(chan websocketEvent, 32),
	}
}

func (client *wsClient) activeConversation() string {
	client.mu.RLock()
	defer client.mu.RUnlock()

	return client.activeConversationID
}

func (client *wsClient) setActiveConversation(conversationID string) {
	client.mu.Lock()
	defer client.mu.Unlock()

	client.activeConversationID = conversationID
}

type changeStreamEvent struct {
	OperationType string `bson:"operationType"`
	Namespace     struct {
		Collection string `bson:"coll"`
	} `bson:"ns"`
	FullDocument bson.M `bson:"fullDocument"`
}

type changeStreamHub struct {
	mu      sync.Mutex
	clients map[*wsClient]struct{}
	mongo   *mongo.Client
}

func newChangeStreamHub(client *mongo.Client) *changeStreamHub {
	return &changeStreamHub{
		clients: map[*wsClient]struct{}{},
		mongo:   client,
	}
}

func (hub *changeStreamHub) register(client *wsClient) {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	hub.clients[client] = struct{}{}
}

func (hub *changeStreamHub) unregister(client *wsClient) {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	if _, ok := hub.clients[client]; ok {
		delete(hub.clients, client)
		close(client.send)
	}
}

func (hub *changeStreamHub) run(ctx context.Context) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.D{
			{Key: "operationType", Value: bson.D{{Key: "$in", Value: bson.A{"insert", "update"}}}},
			{Key: "ns.coll", Value: bson.D{{Key: "$in", Value: bson.A{
				collectionName,
				friendRequestsName,
				friendsName,
			}}}},
		}}},
	}

	for {
		if err := hub.watch(ctx, pipeline); err != nil && ctx.Err() == nil {
			log.Printf("MongoDB Change Stream 中斷，3 秒後重試: %v", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(3 * time.Second):
			}
			continue
		}

		return
	}
}

func (hub *changeStreamHub) watch(ctx context.Context, pipeline mongo.Pipeline) error {
	stream, err := hub.mongo.Database(databaseName).Watch(
		ctx,
		pipeline,
		options.ChangeStream().SetFullDocument(options.UpdateLookup),
	)
	if err != nil {
		return err
	}
	defer stream.Close(ctx)

	for stream.Next(ctx) {
		var event changeStreamEvent
		if err := stream.Decode(&event); err != nil {
			log.Printf("Change Stream 事件解析失敗: %v", err)
			continue
		}

		hub.publish(ctx, event)
	}

	return stream.Err()
}

func (hub *changeStreamHub) publish(ctx context.Context, event changeStreamEvent) {
	eventType := websocketEventType(event.Namespace.Collection)
	if eventType == "" {
		return
	}
	if event.Namespace.Collection == collectionName && event.OperationType == "update" {
		eventType = "read_receipt"
	}

	message := websocketEvent{
		Type:    eventType,
		Payload: event.FullDocument,
	}
	type readMark struct {
		userID         string
		conversationID string
	}
	readMarks := []readMark{}

	hub.mu.Lock()
	for client := range hub.clients {
		if !eventMatchesClient(event, client) {
			continue
		}

		if eventType == "message" {
			conversation, _ := event.FullDocument["conversation_id"].(string)
			recipient, _ := event.FullDocument["recipient_id"].(string)
			if conversation == client.activeConversation() && recipient == client.userID {
				readMarks = append(readMarks, readMark{
					userID:         client.userID,
					conversationID: conversation,
				})
			}
		}

		select {
		case client.send <- message:
		default:
			log.Printf("WebSocket client send buffer full: user_id=%s", client.userID)
		}
	}
	hub.mu.Unlock()

	for _, mark := range readMarks {
		markConversationRead(ctx, hub.mongo, mark.userID, mark.conversationID)
	}
}

func eventMatchesClient(event changeStreamEvent, client *wsClient) bool {
	switch event.Namespace.Collection {
	case collectionName:
		senderID, _ := event.FullDocument["sender_id"].(string)
		recipientID, _ := event.FullDocument["recipient_id"].(string)
		return senderID == client.userID || recipientID == client.userID
	case friendRequestsName:
		toUserID, _ := event.FullDocument["to_user_id"].(string)
		status, _ := event.FullDocument["status"].(string)
		return toUserID == client.userID && status == "pending"
	case friendsName:
		userID, _ := event.FullDocument["user_id"].(string)
		return userID == client.userID
	default:
		return false
	}
}

func conversationIDFor(userA string, userB string) string {
	ids := []string{strings.TrimSpace(userA), strings.TrimSpace(userB)}
	sort.Strings(ids)
	return fmt.Sprintf("dm:%s:%s", ids[0], ids[1])
}

// applyCORS is shared by public API and admin API. Admin requests need
// X-Admin-Token/Authorization for browser preflight.
func applyCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", allowedOrigins)
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token")
}

// isOriginAllowed keeps development open by default while allowing production
// deployments to restrict WebSocket and HTTP origins through ALLOWED_ORIGINS.
func isOriginAllowed(origin string) bool {
	if allowedOrigins == "*" {
		return true
	}
	if origin == "" {
		return true
	}

	for _, allowedOrigin := range strings.Split(allowedOrigins, ",") {
		if strings.TrimSpace(allowedOrigin) == origin {
			return true
		}
	}

	return false
}

func handleUsers(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch r.Method {
	case http.MethodGet:
		listUsers(w, r, client)
	case http.MethodPost:
		createUser(w, r, client)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func listUsers(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))

	filter := bson.M{}
	if userID != "" {
		filter["user_id"] = bson.M{"$ne": userID}
	}

	collection := client.Database(databaseName).Collection(usersName)
	cursor, err := collection.Find(
		r.Context(),
		filter,
		options.Find().SetSort(bson.D{{Key: "display_name", Value: 1}}),
	)
	if err != nil {
		log.Printf("使用者清單讀取失敗: %v", err)
		http.Error(w, "list users failed", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(r.Context())

	users := []userResponse{}
	if err := cursor.All(r.Context(), &users); err != nil {
		log.Printf("使用者清單解析失敗: %v", err)
		http.Error(w, "decode users failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(users); err != nil {
		log.Printf("使用者清單回應 JSON 失敗: %v", err)
	}
}

func createUser(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	req.UserID = strings.TrimSpace(req.UserID)
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.UserID == "" || req.DisplayName == "" || len([]rune(req.DisplayName)) > 32 {
		http.Error(w, "user_id and display_name are required", http.StatusBadRequest)
		return
	}

	now := time.Now()
	collection := client.Database(databaseName).Collection(usersName)
	existingUserCount, err := collection.CountDocuments(r.Context(), bson.M{
		"user_id": bson.M{"$ne": req.UserID},
		"display_name": bson.M{
			"$regex":   "^" + regexp.QuoteMeta(req.DisplayName) + "$",
			"$options": "i",
		},
	})
	if err != nil {
		log.Printf("使用者名稱檢查失敗: %v", err)
		http.Error(w, "check display name failed", http.StatusInternalServerError)
		return
	}
	if existingUserCount > 0 {
		http.Error(w, "display name already exists", http.StatusConflict)
		return
	}

	update := bson.M{
		"$set": bson.M{
			"display_name": req.DisplayName,
			"updated_at":   now,
		},
		"$setOnInsert": bson.M{
			"user_id":    req.UserID,
			"created_at": now,
			"online":     false,
			"last_seen":  now,
		},
	}
	_, err = collection.UpdateOne(
		r.Context(),
		bson.M{"user_id": req.UserID},
		update,
		options.Update().SetUpsert(true),
	)
	if err != nil {
		log.Printf("使用者寫入 MongoDB 失敗: %v", err)
		http.Error(w, "create user failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(userResponse{
		UserID:      req.UserID,
		DisplayName: req.DisplayName,
		CreatedAt:   now,
	}); err != nil {
		log.Printf("使用者回應 JSON 失敗: %v", err)
	}
}

func handleFriends(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch r.Method {
	case http.MethodGet:
		listFriends(w, r, client)
	case http.MethodPost:
		createFriend(w, r, client)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func listFriends(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	if userID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	collection := client.Database(databaseName).Collection(friendsName)
	cursor, err := collection.Find(
		r.Context(),
		bson.M{"user_id": userID},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}}),
	)
	if err != nil {
		log.Printf("朋友清單讀取失敗: %v", err)
		http.Error(w, "list friends failed", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(r.Context())

	friends := []friendResponse{}
	if err := cursor.All(r.Context(), &friends); err != nil {
		log.Printf("朋友清單解析失敗: %v", err)
		http.Error(w, "decode friends failed", http.StatusInternalServerError)
		return
	}
	for index := range friends {
		var user userResponse
		err := client.Database(databaseName).Collection(usersName).
			FindOne(r.Context(), bson.M{"user_id": friends[index].FriendID}).
			Decode(&user)
		if err != nil {
			continue
		}

		friends[index].Online = user.Online
		friends[index].LastSeen = user.LastSeen
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(friends); err != nil {
		log.Printf("朋友清單回應 JSON 失敗: %v", err)
	}
}

func createFriend(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	var req createFriendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	req.UserID = strings.TrimSpace(req.UserID)
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.UserID == "" || req.DisplayName == "" || len([]rune(req.DisplayName)) > 32 {
		http.Error(w, "user_id and display_name are required", http.StatusBadRequest)
		return
	}

	now := time.Now()
	users := client.Database(databaseName).Collection(usersName)

	var fromUser struct {
		UserID      string `bson:"user_id"`
		DisplayName string `bson:"display_name"`
	}
	if err := users.FindOne(r.Context(), bson.M{"user_id": req.UserID}).Decode(&fromUser); err != nil {
		http.Error(w, "current user not found", http.StatusNotFound)
		return
	}

	var targetUser struct {
		UserID      string `bson:"user_id"`
		DisplayName string `bson:"display_name"`
	}
	err := users.FindOne(r.Context(), bson.M{
		"display_name": req.DisplayName,
		"user_id":      bson.M{"$ne": req.UserID},
	}).Decode(&targetUser)
	if err != nil {
		http.Error(w, "friend user not found", http.StatusNotFound)
		return
	}

	request := friendRequestResponse{
		RequestID:       fmt.Sprintf("fr_%d", now.UnixNano()),
		FromUserID:      fromUser.UserID,
		FromDisplayName: fromUser.DisplayName,
		ToUserID:        targetUser.UserID,
		ToDisplayName:   targetUser.DisplayName,
		Status:          "pending",
		CreatedAt:       now,
	}

	requests := client.Database(databaseName).Collection(friendRequestsName)
	filter := bson.M{
		"from_user_id": request.FromUserID,
		"to_user_id":   request.ToUserID,
		"status":       "pending",
	}
	update := bson.M{"$setOnInsert": request}
	_, err = requests.UpdateOne(r.Context(), filter, update, options.Update().SetUpsert(true))
	if err != nil {
		log.Printf("好友邀請寫入 MongoDB 失敗: %v", err)
		http.Error(w, "create friend request failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(request); err != nil {
		log.Printf("好友邀請回應 JSON 失敗: %v", err)
	}
}

func handleFriendRequests(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch r.Method {
	case http.MethodGet:
		listFriendRequests(w, r, client)
	case http.MethodPost:
		respondToFriendRequest(w, r, client)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func listFriendRequests(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	if userID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	collection := client.Database(databaseName).Collection(friendRequestsName)
	cursor, err := collection.Find(
		r.Context(),
		bson.M{"to_user_id": userID, "status": "pending"},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}}),
	)
	if err != nil {
		log.Printf("好友邀請讀取失敗: %v", err)
		http.Error(w, "list friend requests failed", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(r.Context())

	requests := []friendRequestResponse{}
	if err := cursor.All(r.Context(), &requests); err != nil {
		log.Printf("好友邀請解析失敗: %v", err)
		http.Error(w, "decode friend requests failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(requests); err != nil {
		log.Printf("好友邀請回應 JSON 失敗: %v", err)
	}
}

func respondToFriendRequest(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	var req respondFriendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	req.UserID = strings.TrimSpace(req.UserID)
	req.RequestID = strings.TrimSpace(req.RequestID)
	if req.UserID == "" || req.RequestID == "" {
		http.Error(w, "user_id and request_id are required", http.StatusBadRequest)
		return
	}

	requests := client.Database(databaseName).Collection(friendRequestsName)
	var request friendRequestResponse
	err := requests.FindOne(
		r.Context(),
		bson.M{"request_id": req.RequestID, "to_user_id": req.UserID, "status": "pending"},
	).Decode(&request)
	if err != nil {
		http.Error(w, "friend request not found", http.StatusNotFound)
		return
	}

	status := "rejected"
	if req.Accept {
		status = "accepted"
	}

	_, err = requests.UpdateOne(
		r.Context(),
		bson.M{"request_id": req.RequestID},
		bson.M{"$set": bson.M{"status": status, "responded_at": time.Now()}},
	)
	if err != nil {
		log.Printf("好友邀請更新失敗: %v", err)
		http.Error(w, "respond friend request failed", http.StatusInternalServerError)
		return
	}

	if req.Accept {
		if err := createFriendPair(r.Context(), client, request); err != nil {
			log.Printf("好友關係寫入失敗: %v", err)
			http.Error(w, "create friend relation failed", http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(bson.M{"status": status}); err != nil {
		log.Printf("好友邀請處理回應 JSON 失敗: %v", err)
	}
}

func createFriendPair(ctx context.Context, client *mongo.Client, request friendRequestResponse) error {
	collection := client.Database(databaseName).Collection(friendsName)
	now := time.Now()
	relations := []friendResponse{
		{
			UserID:      request.FromUserID,
			FriendID:    request.ToUserID,
			DisplayName: request.ToDisplayName,
			CreatedAt:   now,
		},
		{
			UserID:      request.ToUserID,
			FriendID:    request.FromUserID,
			DisplayName: request.FromDisplayName,
			CreatedAt:   now,
		},
	}

	for _, relation := range relations {
		filter := bson.M{"user_id": relation.UserID, "friend_id": relation.FriendID}
		update := bson.M{"$setOnInsert": relation}
		if _, err := collection.UpdateOne(ctx, filter, update, options.Update().SetUpsert(true)); err != nil {
			return err
		}
	}

	return nil
}

// handleConnections owns one WebSocket session: it registers presence, joins
// the shared Change Stream hub, and persists incoming messages.
func handleConnections(w http.ResponseWriter, r *http.Request, client *mongo.Client, presence *PresenceStore, hub *changeStreamHub) {
	userID := r.URL.Query().Get("user_id")
	conversationID := r.URL.Query().Get("conversation_id")
	if userID == "" || conversationID == "" {
		http.Error(w, "user_id and conversation_id are required", http.StatusBadRequest)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket 升級失敗: %v", err)
		return
	}
	defer ws.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	if err := presence.Connect(ctx, userID); err != nil {
		log.Printf("Redis 使用者在線狀態設定失敗: %v", err)
		return
	}
	defer presence.Disconnect(context.Background(), userID)
	go presence.KeepAlive(ctx, userID)

	fmt.Printf("React 前端已連線: user_id=%s conversation_id=%s\n", userID, conversationID)

	wsClient := newWSClient(userID, conversationID)
	hub.register(wsClient)
	defer hub.unregister(wsClient)
	go writeWebSocketEvents(ctx, ws, wsClient)
	markConversationRead(ctx, client, userID, conversationID)

	collection := client.Database(databaseName).Collection(collectionName)

	for {
		var msg bson.M
		if err := ws.ReadJSON(&msg); err != nil {
			log.Printf("WebSocket 連線結束: %v", err)
			return
		}

		if eventType, _ := msg["type"].(string); eventType == "active_conversation" {
			nextConversationID, _ := msg["conversation_id"].(string)
			nextConversationID = strings.TrimSpace(nextConversationID)
			if nextConversationID != "" && conversationIncludesUser(nextConversationID, userID) {
				wsClient.setActiveConversation(nextConversationID)
				markConversationRead(ctx, client, userID, nextConversationID)
			}
			continue
		}

		recipientID, _ := msg["recipient_id"].(string)
		recipientID = strings.TrimSpace(recipientID)
		if recipientID == "" {
			log.Printf("略過缺少 recipient_id 的訊息")
			continue
		}

		msg["time"] = time.Now()
		msg["sender_id"] = userID
		msg["conversation_id"] = conversationIDFor(userID, recipientID)
		msg["read_at"] = nil

		result, err := collection.InsertOne(ctx, msg)
		if err != nil {
			log.Printf("訊息寫入 MongoDB 失敗: %v", err)
			return
		}
		if recipientID == stockBotID {
			go processStockBotMessage(context.Background(), client, msg, result.InsertedID)
		}

		fmt.Printf("收到訊息並存入資料庫: %v\n", msg["text"])
	}
}

func writeWebSocketEvents(ctx context.Context, ws *websocket.Conn, client *wsClient) {
	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-client.send:
			if !ok {
				return
			}
			if err := ws.WriteJSON(event); err != nil {
				log.Printf("WebSocket 推播失敗: %v", err)
				return
			}
			fmt.Printf("已即時推播 %s 到前端\n", event.Type)
		}
	}
}

func handleMessages(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	conversationID := strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	if userID == "" || conversationID == "" {
		http.Error(w, "user_id and conversation_id are required", http.StatusBadRequest)
		return
	}

	if !conversationIncludesUser(conversationID, userID) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	markConversationRead(r.Context(), client, userID, conversationID)

	collection := client.Database(databaseName).Collection(collectionName)
	cursor, err := collection.Find(
		r.Context(),
		bson.M{"conversation_id": conversationID},
		options.Find().SetSort(bson.D{{Key: "time", Value: 1}}).SetLimit(100),
	)
	if err != nil {
		log.Printf("歷史訊息讀取失敗: %v", err)
		http.Error(w, "list messages failed", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(r.Context())

	messages := []bson.M{}
	if err := cursor.All(r.Context(), &messages); err != nil {
		log.Printf("歷史訊息解析失敗: %v", err)
		http.Error(w, "decode messages failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(messages); err != nil {
		log.Printf("歷史訊息回應 JSON 失敗: %v", err)
	}
}

func handleConversations(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	if userID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	collection := client.Database(databaseName).Collection(collectionName)
	cursor, err := collection.Find(
		r.Context(),
		bson.M{"$or": bson.A{
			bson.M{"sender_id": userID},
			bson.M{"recipient_id": userID},
		}},
		options.Find().SetSort(bson.D{{Key: "time", Value: -1}}).SetLimit(500),
	)
	if err != nil {
		log.Printf("對話清單讀取失敗: %v", err)
		http.Error(w, "list conversations failed", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(r.Context())

	friendNames := loadFriendNames(r.Context(), client, userID)
	conversations := []conversationResponse{}
	seen := map[string]bool{}

	for cursor.Next(r.Context()) {
		var message bson.M
		if err := cursor.Decode(&message); err != nil {
			log.Printf("對話訊息解析失敗: %v", err)
			continue
		}

		conversationID, _ := message["conversation_id"].(string)
		if conversationID == "" || seen[conversationID] {
			continue
		}

		senderID, _ := message["sender_id"].(string)
		recipientID, _ := message["recipient_id"].(string)
		otherID := recipientID
		if senderID != userID {
			otherID = senderID
		}
		if otherID == "" {
			continue
		}

		displayName, isFriend := friendNames[otherID]
		if displayName == "" {
			displayName = lookupDisplayName(r.Context(), client, otherID)
		}

		conversations = append(conversations, conversationResponse{
			ConversationID:      conversationID,
			RecipientID:         otherID,
			DisplayName:         displayName,
			LastMessage:         messagePreviewText(message),
			LastMessageAt:       messageTime(message["time"]),
			LastMessageSenderID: senderID,
			LastMessageReadAt:   messageTimePtr(message["read_at"]),
			IsFriend:            isFriend,
			UnreadCount:         countUnreadMessages(r.Context(), client, userID, conversationID),
		})
		seen[conversationID] = true
	}

	if err := cursor.Err(); err != nil {
		log.Printf("對話清單 cursor 失敗: %v", err)
		http.Error(w, "list conversations failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(conversations); err != nil {
		log.Printf("對話清單回應 JSON 失敗: %v", err)
	}
}

func messagePreviewText(message bson.M) string {
	text := strings.TrimSpace(fmt.Sprint(message["text"]))
	if text != "" && text != "<nil>" {
		return text
	}

	attachmentURL, _ := message["attachment_url"].(string)
	if attachmentURL != "" {
		return "已傳送檔案"
	}

	imageURL, _ := message["image_url"].(string)
	if imageURL != "" {
		return "已傳送圖片"
	}

	return ""
}

func loadFriendNames(ctx context.Context, client *mongo.Client, userID string) map[string]string {
	collection := client.Database(databaseName).Collection(friendsName)
	cursor, err := collection.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		return map[string]string{}
	}
	defer cursor.Close(ctx)

	names := map[string]string{}
	for cursor.Next(ctx) {
		var friend friendResponse
		if err := cursor.Decode(&friend); err == nil {
			names[friend.FriendID] = friend.DisplayName
		}
	}

	return names
}

func lookupDisplayName(ctx context.Context, client *mongo.Client, userID string) string {
	if userID == "stock_bot" {
		return "行情小幫手"
	}

	var user userResponse
	err := client.Database(databaseName).Collection(usersName).
		FindOne(ctx, bson.M{"user_id": userID}).
		Decode(&user)
	if err != nil || user.DisplayName == "" {
		return userID
	}

	return user.DisplayName
}

func messageTime(value interface{}) time.Time {
	switch typed := value.(type) {
	case time.Time:
		return typed
	case primitive.DateTime:
		return typed.Time()
	default:
		return time.Time{}
	}
}

func messageTimePtr(value interface{}) *time.Time {
	valueTime := messageTime(value)
	if valueTime.IsZero() {
		return nil
	}

	return &valueTime
}

func countUnreadMessages(ctx context.Context, client *mongo.Client, userID string, conversationID string) int64 {
	count, err := client.Database(databaseName).Collection(collectionName).CountDocuments(ctx, bson.M{
		"conversation_id": conversationID,
		"recipient_id":    userID,
		"read_at":         nil,
	})
	if err != nil {
		log.Printf("未讀訊息計算失敗: %v", err)
		return 0
	}

	return count
}

func conversationIncludesUser(conversationID string, userID string) bool {
	for _, part := range strings.Split(conversationID, ":") {
		if part == userID {
			return true
		}
	}

	return false
}

func markConversationRead(ctx context.Context, client *mongo.Client, userID string, conversationID string) {
	collection := client.Database(databaseName).Collection(collectionName)
	_, err := collection.UpdateMany(
		ctx,
		bson.M{
			"conversation_id": conversationID,
			"recipient_id":    userID,
			"read_at":         nil,
		},
		bson.M{"$set": bson.M{"read_at": time.Now()}},
	)
	if err != nil {
		log.Printf("標記已讀失敗: %v", err)
	}
}

func websocketEventType(collection string) string {
	switch collection {
	case collectionName:
		return "message"
	case friendRequestsName:
		return "friend_request"
	case friendsName:
		return "friend_added"
	default:
		return ""
	}
}

// Run wires infrastructure, indexes, HTTP routes, WebSocket routing, and admin
// routes into a single server process.
func Run(cfg Config) error {
	databaseName = cfg.DatabaseName
	allowedOrigins = cfg.AllowedOrigins

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		return err
	}
	defer client.Disconnect(context.Background())

	if err := client.Ping(ctx, nil); err != nil {
		return err
	}
	if err := ensureIndexes(ctx, client); err != nil {
		return err
	}
	redisOptions := &redis.Options{
		Addr:     cfg.RedisAddr,
		Username: cfg.RedisUsername,
		Password: cfg.RedisPassword,
	}
	if cfg.RedisTLS {
		redisOptions.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	redisClient := redis.NewClient(redisOptions)
	defer redisClient.Close()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		return err
	}
	presence := NewPresenceStore(redisClient, client)
	hubCtx, stopHub := context.WithCancel(context.Background())
	defer stopHub()
	hub := newChangeStreamHub(client)
	go hub.run(hubCtx)

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handleConnections(w, r, client, presence, hub)
	})
	mux.HandleFunc("/users", func(w http.ResponseWriter, r *http.Request) {
		handleUsers(w, r, client)
	})
	mux.HandleFunc("/friends", func(w http.ResponseWriter, r *http.Request) {
		handleFriends(w, r, client)
	})
	mux.HandleFunc("/friend-requests", func(w http.ResponseWriter, r *http.Request) {
		handleFriendRequests(w, r, client)
	})
	mux.HandleFunc("/messages", func(w http.ResponseWriter, r *http.Request) {
		handleMessages(w, r, client)
	})
	mux.HandleFunc("/conversations", func(w http.ResponseWriter, r *http.Request) {
		handleConversations(w, r, client)
	})
	registerAdminRoutes(mux, client, redisClient, cfg.AdminToken)

	fmt.Printf("Go WebSocket 伺服器啟動於 %s\n", cfg.ServerAddr)
	return http.ListenAndServe(cfg.ServerAddr, mux)
}
