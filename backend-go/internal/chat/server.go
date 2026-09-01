package chat

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"slices"
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
	collectionName      = "messages"
	usersName           = "users"
	adminsName          = "admins"
	friendsName         = "friends"
	friendRequestsName  = "friend_requests"
	deletedChatsName    = "deleted_conversations"
	groupsName          = "groups"
	voiceSignalsChannel = "yuna-im:voice-signals"
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
	mu        sync.Mutex
	clients   map[*wsClient]struct{}
	mongo     *mongo.Client
	blackjack *BlackjackStore
}

type voiceSignalEnvelope struct {
	RecipientID string         `json:"recipient_id"`
	Event       websocketEvent `json:"event"`
}

type blackjackEventEnvelope struct {
	Events map[string]websocketEvent `json:"events"`
}

func newChangeStreamHub(client *mongo.Client, blackjack *BlackjackStore) *changeStreamHub {
	return &changeStreamHub{
		clients:   map[*wsClient]struct{}{},
		mongo:     client,
		blackjack: blackjack,
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
				groupsName,
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

func (hub *changeStreamHub) sendToUser(userID string, event websocketEvent) bool {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	delivered := false
	for client := range hub.clients {
		if client.userID != userID {
			continue
		}
		select {
		case client.send <- event:
			delivered = true
		default:
			log.Printf("WebSocket client send buffer full: user_id=%s", client.userID)
		}
	}
	return delivered
}

func (hub *changeStreamHub) sendActiveBlackjackGames(ctx context.Context, userID string) {
	sessions, err := hub.blackjack.ListForUser(ctx, userID)
	if err != nil {
		log.Printf("Redis 21 點牌局恢復失敗: user_id=%s error=%v", userID, err)
		return
	}
	seenConversations := make(map[string]bool, len(sessions))
	for _, session := range sessions {
		if seenConversations[session.ConversationID] {
			continue
		}
		seenConversations[session.ConversationID] = true
		eventType := "game_state"
		if session.Status == "finished" || session.Status == "canceled" {
			eventType = "game_result"
		}
		hub.sendToUser(userID, websocketEvent{Type: eventType, Payload: blackjackStateForPlayer(session, userID)})
	}
}

func (hub *changeStreamHub) syncActiveBlackjackGames(ctx context.Context) {
	userIDs := map[string]bool{}
	hub.mu.Lock()
	for client := range hub.clients {
		userIDs[client.userID] = true
	}
	hub.mu.Unlock()
	for userID := range userIDs {
		hub.sendActiveBlackjackGames(ctx, userID)
	}
}

func eventMatchesClient(event changeStreamEvent, client *wsClient) bool {
	switch event.Namespace.Collection {
	case collectionName:
		senderID, _ := event.FullDocument["sender_id"].(string)
		recipientID, _ := event.FullDocument["recipient_id"].(string)
		if senderID == client.userID || recipientID == client.userID {
			return true
		}
		return stringSliceContains(bsonStringSlice(event.FullDocument["participant_ids"]), client.userID)
	case friendRequestsName:
		toUserID, _ := event.FullDocument["to_user_id"].(string)
		status, _ := event.FullDocument["status"].(string)
		return toUserID == client.userID && status == "pending"
	case friendsName:
		userID, _ := event.FullDocument["user_id"].(string)
		return userID == client.userID
	case groupsName:
		return stringSliceContains(bsonStringSlice(event.FullDocument["member_ids"]), client.userID)
	default:
		return false
	}
}

func isCallSignalType(eventType string) bool {
	switch eventType {
	case "voice_offer", "voice_answer", "voice_ice", "voice_reject", "voice_end",
		"video_offer", "video_answer", "video_ice", "video_reject", "video_end":
		return true
	default:
		return false
	}
}

func deliverVoiceSignalPayload(hub *changeStreamHub, payload []byte) error {
	var signal voiceSignalEnvelope
	if err := json.Unmarshal(payload, &signal); err != nil {
		return err
	}
	hub.sendToUser(signal.RecipientID, signal.Event)
	return nil
}

func runVoiceSignals(hub *changeStreamHub, subscription *redis.PubSub) {
	for message := range subscription.Channel() {
		if err := deliverVoiceSignalPayload(hub, []byte(message.Payload)); err != nil {
			log.Printf("Redis 語音 signaling 解析失敗: %v", err)
		}
	}
}

func publishVoiceSignal(ctx context.Context, redisClient *redis.Client, signal voiceSignalEnvelope) error {
	payload, err := json.Marshal(signal)
	if err != nil {
		return err
	}
	return redisClient.Publish(ctx, voiceSignalsChannel, payload).Err()
}

func deliverBlackjackEventPayload(hub *changeStreamHub, payload []byte) error {
	var envelope blackjackEventEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return err
	}
	for playerID, event := range envelope.Events {
		hub.sendToUser(playerID, event)
	}
	return nil
}

func runBlackjackEvents(hub *changeStreamHub, subscription *redis.PubSub) {
	for message := range subscription.Channel() {
		if err := deliverBlackjackEventPayload(hub, []byte(message.Payload)); err != nil {
			log.Printf("Redis 21 點事件解析失敗: %v", err)
		}
	}
}

func forwardVoiceSignal(ctx context.Context, client *mongo.Client, redisClient *redis.Client, senderID string, msg bson.M) {
	eventType, _ := msg["type"].(string)
	recipientID, _ := msg["recipient_id"].(string)
	conversationID, _ := msg["conversation_id"].(string)
	recipientID = strings.TrimSpace(recipientID)
	conversationID = strings.TrimSpace(conversationID)

	if recipientID == "" {
		log.Printf("略過語音 signaling: sender=%s recipient=%s conversation=%s", senderID, recipientID, conversationID)
		return
	}
	if conversationID == "" {
		conversationID = conversationIDFor(senderID, recipientID)
	}
	if strings.HasPrefix(conversationID, "group:") {
		log.Printf("略過語音 signaling: sender=%s recipient=%s conversation=%s", senderID, recipientID, conversationID)
		return
	}
	if conversationIDFor(senderID, recipientID) != conversationID || !conversationIncludesUser(ctx, client, conversationID, senderID) {
		log.Printf("略過未授權語音 signaling: sender=%s recipient=%s conversation=%s", senderID, recipientID, conversationID)
		return
	}

	payload := bson.M{
		"type":            eventType,
		"sender_id":       senderID,
		"recipient_id":    recipientID,
		"conversation_id": conversationID,
	}
	for _, key := range []string{"offer", "answer", "candidate"} {
		if value, ok := msg[key]; ok {
			payload[key] = value
		}
	}

	if err := publishVoiceSignal(ctx, redisClient, voiceSignalEnvelope{
		RecipientID: recipientID,
		Event: websocketEvent{
			Type:    eventType,
			Payload: payload,
		},
	}); err != nil {
		log.Printf("Redis 語音 signaling 發送失敗: %v", err)
	}
}

func conversationIDFor(userA string, userB string) string {
	ids := []string{strings.TrimSpace(userA), strings.TrimSpace(userB)}
	sort.Strings(ids)
	return fmt.Sprintf("dm:%s:%s", ids[0], ids[1])
}

func groupConversationID(groupID string, memberIDs []string) string {
	ids := append([]string{}, memberIDs...)
	sort.Strings(ids)
	return fmt.Sprintf("group:%s:%s", strings.TrimSpace(groupID), strings.Join(ids, ":"))
}

// applyCORS is shared by public API and admin API. Admin requests need
// X-Admin-Token/Authorization for browser preflight.
func applyCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", allowedOrigins)
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
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
	if origin == "null" {
		return true
	}
	if isMobileDevelopmentOrigin(origin) {
		return true
	}

	for _, allowedOrigin := range strings.Split(allowedOrigins, ",") {
		if strings.TrimSpace(allowedOrigin) == origin {
			return true
		}
	}

	return false
}

func isMobileDevelopmentOrigin(origin string) bool {
	parsedOrigin, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if parsedOrigin.Scheme == "react-native" {
		return true
	}
	if parsedOrigin.Scheme == "file" {
		return true
	}

	host := parsedOrigin.Hostname()
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
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
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func listUsers(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	userID := authenticatedUserID(r)

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

func handleFriends(w http.ResponseWriter, r *http.Request, client *mongo.Client, hub *changeStreamHub) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch r.Method {
	case http.MethodGet:
		listFriends(w, r, client)
	case http.MethodPost:
		createFriend(w, r, client, hub)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func listFriends(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	userID := authenticatedUserID(r)
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
		friends[index].AvatarURL = user.AvatarURL
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(friends); err != nil {
		log.Printf("朋友清單回應 JSON 失敗: %v", err)
	}
}

func createFriend(w http.ResponseWriter, r *http.Request, client *mongo.Client, hub *changeStreamHub) {
	var req createFriendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	req.UserID = authenticatedUserID(r)
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
	result, err := requests.UpdateOne(r.Context(), filter, update, options.Update().SetUpsert(true))
	if err != nil {
		log.Printf("好友邀請寫入 MongoDB 失敗: %v", err)
		http.Error(w, "create friend request failed", http.StatusInternalServerError)
		return
	}
	if result.UpsertedCount == 0 {
		if err := requests.FindOne(r.Context(), filter).Decode(&request); err != nil {
			log.Printf("既有好友邀請讀取失敗: %v", err)
			http.Error(w, "create friend request failed", http.StatusInternalServerError)
			return
		}
	}

	if hub != nil {
		hub.sendToUser(request.ToUserID, websocketEvent{Type: "friend_request", Payload: bson.M{
			"request_id":        request.RequestID,
			"from_user_id":      request.FromUserID,
			"from_display_name": request.FromDisplayName,
			"to_user_id":        request.ToUserID,
			"to_display_name":   request.ToDisplayName,
			"status":            request.Status,
			"created_at":        request.CreatedAt,
		}})
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(request); err != nil {
		log.Printf("好友邀請回應 JSON 失敗: %v", err)
	}
}

func handleDeleteFriend(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req deleteFriendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	req.UserID = authenticatedUserID(r)
	req.FriendID = strings.TrimSpace(req.FriendID)
	if req.UserID == "" || req.FriendID == "" || req.UserID == req.FriendID {
		http.Error(w, "user_id and friend_id are required", http.StatusBadRequest)
		return
	}

	result, err := client.Database(databaseName).Collection(friendsName).DeleteMany(
		r.Context(),
		bson.M{"$or": bson.A{
			bson.M{"user_id": req.UserID, "friend_id": req.FriendID},
			bson.M{"user_id": req.FriendID, "friend_id": req.UserID},
		}},
	)
	if err != nil {
		log.Printf("刪除好友失敗: %v", err)
		http.Error(w, "delete friend failed", http.StatusInternalServerError)
		return
	}
	if result.DeletedCount == 0 {
		http.Error(w, "friend relation not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
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
	userID := authenticatedUserID(r)
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

	req.UserID = authenticatedUserID(r)
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

func handleGroups(w http.ResponseWriter, r *http.Request, client *mongo.Client, hub *changeStreamHub) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch r.Method {
	case http.MethodGet:
		listGroups(w, r, client)
	case http.MethodPost:
		createGroup(w, r, client, hub)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func listGroups(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	userID := authenticatedUserID(r)
	if userID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	collection := client.Database(databaseName).Collection(groupsName)
	cursor, err := collection.Find(
		r.Context(),
		bson.M{"member_ids": userID},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}}),
	)
	if err != nil {
		log.Printf("群組清單讀取失敗: %v", err)
		http.Error(w, "list groups failed", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(r.Context())

	groups := []groupResponse{}
	if err := cursor.All(r.Context(), &groups); err != nil {
		log.Printf("群組清單解析失敗: %v", err)
		http.Error(w, "decode groups failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(groups); err != nil {
		log.Printf("群組清單回應 JSON 失敗: %v", err)
	}
}

func createGroup(w http.ResponseWriter, r *http.Request, client *mongo.Client, hub *changeStreamHub) {
	var req createGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	req.UserID = authenticatedUserID(r)
	req.Name = strings.TrimSpace(req.Name)
	memberIDs := uniqueNonEmptyStrings(append(req.MemberIDs, req.UserID))
	if req.UserID == "" || req.Name == "" || len([]rune(req.Name)) > 32 || len(memberIDs) < 2 {
		http.Error(w, "user_id, name, and at least one member are required", http.StatusBadRequest)
		return
	}

	usersCount, err := client.Database(databaseName).Collection(usersName).CountDocuments(
		r.Context(),
		bson.M{"user_id": bson.M{"$in": memberIDs}},
	)
	if err != nil {
		log.Printf("群組成員檢查失敗: %v", err)
		http.Error(w, "check group members failed", http.StatusInternalServerError)
		return
	}
	if usersCount != int64(len(memberIDs)) {
		http.Error(w, "group member not found", http.StatusNotFound)
		return
	}

	now := time.Now()
	groupID := fmt.Sprintf("grp_%d", now.UnixNano())
	group := groupResponse{
		GroupID:        groupID,
		Name:           req.Name,
		MemberIDs:      memberIDs,
		ConversationID: groupConversationID(groupID, memberIDs),
		CreatedBy:      req.UserID,
		CreatedAt:      now,
	}

	if _, err := client.Database(databaseName).Collection(groupsName).InsertOne(r.Context(), group); err != nil {
		log.Printf("群組寫入 MongoDB 失敗: %v", err)
		http.Error(w, "create group failed", http.StatusInternalServerError)
		return
	}

	if hub != nil {
		event := changeStreamEvent{
			OperationType: "insert",
			FullDocument: bson.M{
				"group_id":        group.GroupID,
				"name":            group.Name,
				"member_ids":      group.MemberIDs,
				"conversation_id": group.ConversationID,
				"created_by":      group.CreatedBy,
				"created_at":      group.CreatedAt,
			},
		}
		event.Namespace.Collection = groupsName
		hub.publish(r.Context(), event)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(group); err != nil {
		log.Printf("群組建立回應 JSON 失敗: %v", err)
	}
}

func handleLeaveGroup(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req leaveGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	req.UserID = authenticatedUserID(r)
	req.GroupID = strings.TrimSpace(req.GroupID)
	if req.UserID == "" || req.GroupID == "" {
		http.Error(w, "user_id and group_id are required", http.StatusBadRequest)
		return
	}

	collection := client.Database(databaseName).Collection(groupsName)
	result, err := collection.UpdateOne(
		r.Context(),
		bson.M{"group_id": req.GroupID, "member_ids": req.UserID},
		bson.M{"$pull": bson.M{"member_ids": req.UserID}},
	)
	if err != nil {
		log.Printf("退出群組失敗: %v", err)
		http.Error(w, "leave group failed", http.StatusInternalServerError)
		return
	}
	if result.MatchedCount == 0 {
		http.Error(w, "group not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleConnections owns one WebSocket session: it registers presence, joins
// the shared Change Stream hub, and persists incoming messages.
func handleConnections(w http.ResponseWriter, r *http.Request, client *mongo.Client, redisClient *redis.Client, sessions *SessionStore, presence *PresenceStore, hub *changeStreamHub) {
	userID, err := sessions.ConsumeWSTicket(r.Context(), r.URL.Query().Get("ticket"))
	if err != nil {
		http.Error(w, "invalid websocket ticket", http.StatusUnauthorized)
		return
	}
	conversationID := strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	exists, err := userExists(r.Context(), client, userID)
	if err != nil {
		http.Error(w, "user lookup unavailable", http.StatusServiceUnavailable)
		return
	}
	if !exists {
		http.Error(w, "user not found", http.StatusUnauthorized)
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
	go closeDeletedUserConnection(ctx, client, userID, ws)

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
	hub.sendActiveBlackjackGames(ctx, userID)
	if conversationID != "" {
		markConversationRead(ctx, client, userID, conversationID)
	}

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
			if nextConversationID != "" && conversationIncludesUser(ctx, client, nextConversationID, userID) {
				wsClient.setActiveConversation(nextConversationID)
				markConversationRead(ctx, client, userID, nextConversationID)
			}
			continue
		} else if isCallSignalType(eventType) {
			forwardVoiceSignal(ctx, client, redisClient, userID, msg)
			continue
		} else if eventType == "game_action" {
			gameID, _ := msg["game_id"].(string)
			action, _ := msg["game_action"].(string)
			actionID, _ := msg["action_id"].(string)
			_, err := hub.blackjack.ApplyAction(ctx, userID, strings.TrimSpace(gameID), strings.TrimSpace(action))
			if err != nil {
				code := "invalid_action"
				if errors.Is(err, redis.Nil) {
					code = "game_not_found"
				} else if !errors.Is(err, errBlackjackInvalid) {
					code = "temporarily_unavailable"
					log.Printf("Redis 21 點操作失敗: game_id=%s error=%v", gameID, err)
				}
				hub.sendToUser(userID, websocketEvent{Type: "game_action_error", Payload: bson.M{
					"game_id": gameID, "game_action": action, "action_id": actionID, "code": code,
				}})
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
		msg["read_at"] = nil

		clientConversationID, _ := msg["conversation_id"].(string)
		clientConversationID = strings.TrimSpace(clientConversationID)
		if strings.HasPrefix(clientConversationID, "group:") {
			group, err := lookupGroupByConversation(ctx, client, clientConversationID)
			if err != nil || !stringSliceContains(group.MemberIDs, userID) {
				log.Printf("略過未授權群組訊息: user_id=%s conversation_id=%s", userID, clientConversationID)
				continue
			}
			msg["recipient_id"] = group.GroupID
			msg["conversation_id"] = group.ConversationID
			msg["participant_ids"] = group.MemberIDs
			msg["read_by"] = []string{userID}
			delete(msg, "read_at")
		} else {
			msg["conversation_id"] = conversationIDFor(userID, recipientID)
		}

		gameType, _ := msg["game_type"].(string)
		gameAction, _ := msg["game_action"].(string)
		gameResponseReservationKey := ""
		var pendingBlackjackSession *blackjackSession
		if gameType == "blackjack" {
			if gameAction == "invite" {
				if gameID, _ := msg["game_id"].(string); strings.TrimSpace(gameID) == "" {
					msg["game_id"] = fmt.Sprintf("bj_%d", time.Now().UnixNano())
				}
			} else if gameAction == "accept" || gameAction == "reject" {
				gameID, _ := msg["game_id"].(string)
				gameID = strings.TrimSpace(gameID)
				inviteCount, inviteErr := collection.CountDocuments(ctx, bson.M{
					"game_id": gameID, "game_type": "blackjack", "game_action": "invite",
					"sender_id": recipientID, "recipient_id": userID,
					"time": bson.M{"$gte": time.Now().Add(-blackjackInviteTimeout)},
				})
				responseCount, responseErr := collection.CountDocuments(ctx, bson.M{
					"game_id": gameID, "game_type": "blackjack",
					"game_action": bson.M{"$in": bson.A{"accept", "reject"}},
				})
				if gameID == "" || inviteErr != nil || responseErr != nil || inviteCount == 0 || responseCount > 0 {
					continue
				}
				gameResponseReservationKey = blackjackInviteResponseKey(gameID)
				reserved, reserveErr := redisClient.SetNX(ctx, gameResponseReservationKey, gameAction, blackjackInviteTimeout).Result()
				if reserveErr != nil || !reserved {
					continue
				}
				if gameAction == "accept" {
					session, createErr := hub.blackjack.Create(ctx, gameID, msg["conversation_id"].(string), recipientID, userID)
					if createErr != nil {
						redisClient.Del(ctx, gameResponseReservationKey)
						if !errors.Is(createErr, errBlackjackExists) {
							log.Printf("Redis 21 點牌局建立失敗: game_id=%s error=%v", gameID, createErr)
						}
						continue
					}
					pendingBlackjackSession = &session
				}
			}
		}

		inserted, err := collection.InsertOne(ctx, msg)
		if err != nil {
			if pendingBlackjackSession != nil {
				hub.blackjack.Delete(ctx, *pendingBlackjackSession)
			}
			if gameResponseReservationKey != "" {
				redisClient.Del(ctx, gameResponseReservationKey)
			}
			log.Printf("訊息寫入 MongoDB 失敗: %v", err)
			return
		}
		if pendingBlackjackSession != nil {
			if _, activateErr := hub.blackjack.Activate(ctx, pendingBlackjackSession.GameID); activateErr != nil {
				collection.DeleteOne(ctx, bson.M{"_id": inserted.InsertedID})
				hub.blackjack.Delete(ctx, *pendingBlackjackSession)
				redisClient.Del(ctx, gameResponseReservationKey)
				log.Printf("Redis 21 點牌局啟用失敗: game_id=%s error=%v", pendingBlackjackSession.GameID, activateErr)
				continue
			}
		}

		fmt.Printf("收到訊息並存入資料庫: %v\n", msg["text"])
	}
}

func userExists(ctx context.Context, client *mongo.Client, userID string) (bool, error) {
	count, err := client.Database(databaseName).Collection(usersName).CountDocuments(
		ctx, bson.M{"user_id": userID}, options.Count().SetLimit(1),
	)
	return count == 1, err
}

func closeDeletedUserConnection(ctx context.Context, client *mongo.Client, userID string, ws *websocket.Conn) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			exists, err := userExists(ctx, client, userID)
			if err == nil && !exists {
				ws.Close()
				return
			}
		}
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

	userID := authenticatedUserID(r)
	conversationID := strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	if userID == "" || conversationID == "" {
		http.Error(w, "user_id and conversation_id are required", http.StatusBadRequest)
		return
	}

	if !conversationIncludesUser(r.Context(), client, conversationID, userID) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	markConversationRead(r.Context(), client, userID, conversationID)

	collection := client.Database(databaseName).Collection(collectionName)
	filter := bson.M{"conversation_id": conversationID}
	if deletedAt, ok := loadDeletedConversationTime(r.Context(), client, userID, conversationID); ok {
		filter["time"] = bson.M{"$gt": deletedAt}
	}
	cursor, err := collection.Find(
		r.Context(),
		filter,
		options.Find().SetSort(bson.D{{Key: "time", Value: -1}}).SetLimit(100),
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
	chronologicalMessages(messages)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(messages); err != nil {
		log.Printf("歷史訊息回應 JSON 失敗: %v", err)
	}
}

func chronologicalMessages(messages []bson.M) {
	slices.Reverse(messages)
}

func loadDeletedConversationTime(ctx context.Context, client *mongo.Client, userID string, conversationID string) (time.Time, bool) {
	var row struct {
		DeletedAt time.Time `bson:"deleted_at"`
	}
	err := client.Database(databaseName).Collection(deletedChatsName).FindOne(ctx, bson.M{
		"user_id":         userID,
		"conversation_id": conversationID,
	}).Decode(&row)
	return row.DeletedAt, err == nil
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

	userID := authenticatedUserID(r)
	if userID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}
	deletedConversations := loadDeletedConversationTimes(r.Context(), client, userID)

	collection := client.Database(databaseName).Collection(collectionName)
	cursor, err := collection.Find(
		r.Context(),
		bson.M{"$or": bson.A{
			bson.M{"sender_id": userID},
			bson.M{"recipient_id": userID},
			bson.M{"participant_ids": userID},
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
		deletedAt, isDeleted := deletedConversations[conversationID]
		if conversationID == "" || seen[conversationID] || (isDeleted && !messageTime(message["time"]).After(deletedAt)) {
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
		isGroup := strings.HasPrefix(conversationID, "group:")
		memberIDs := []string{}
		avatarURL := ""
		if isGroup {
			group, err := lookupGroupByConversation(r.Context(), client, conversationID)
			if err != nil || !stringSliceContains(group.MemberIDs, userID) {
				continue
			}
			otherID = group.GroupID
			displayName = group.Name
			memberIDs = group.MemberIDs
		} else if displayName == "" {
			displayName = lookupDisplayName(r.Context(), client, otherID)
		}
		if !isGroup {
			avatarURL = lookupAvatarURL(r.Context(), client, otherID)
		}

		conversations = append(conversations, conversationResponse{
			ConversationID:      conversationID,
			RecipientID:         otherID,
			DisplayName:         displayName,
			AvatarURL:           avatarURL,
			LastMessage:         messagePreviewText(message),
			LastMessageAt:       messageTime(message["time"]),
			LastMessageSenderID: senderID,
			LastMessageReadAt:   messageTimePtr(message["read_at"]),
			IsFriend:            isFriend,
			IsGroup:             isGroup,
			MemberIDs:           memberIDs,
		})
		seen[conversationID] = true
	}

	if err := cursor.Err(); err != nil {
		log.Printf("對話清單 cursor 失敗: %v", err)
		http.Error(w, "list conversations failed", http.StatusInternalServerError)
		return
	}

	populateUnreadCounts(r.Context(), client, userID, conversations)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(conversations); err != nil {
		log.Printf("對話清單回應 JSON 失敗: %v", err)
	}
}

func loadDeletedConversationTimes(ctx context.Context, client *mongo.Client, userID string) map[string]time.Time {
	cursor, err := client.Database(databaseName).Collection(deletedChatsName).Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		return map[string]time.Time{}
	}
	defer cursor.Close(ctx)

	deletedAtByConversation := map[string]time.Time{}
	for cursor.Next(ctx) {
		var row struct {
			ConversationID string    `bson:"conversation_id"`
			DeletedAt      time.Time `bson:"deleted_at"`
		}
		if err := cursor.Decode(&row); err == nil && row.ConversationID != "" {
			deletedAtByConversation[row.ConversationID] = row.DeletedAt
		}
	}
	return deletedAtByConversation
}

func handleDeleteConversation(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req deleteConversationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	req.UserID = authenticatedUserID(r)
	req.ConversationID = strings.TrimSpace(req.ConversationID)
	if req.UserID == "" || req.ConversationID == "" {
		http.Error(w, "user_id and conversation_id are required", http.StatusBadRequest)
		return
	}
	if !conversationIncludesUser(r.Context(), client, req.ConversationID, req.UserID) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	_, err := client.Database(databaseName).Collection(deletedChatsName).UpdateOne(
		r.Context(),
		bson.M{"user_id": req.UserID, "conversation_id": req.ConversationID},
		bson.M{"$set": bson.M{"user_id": req.UserID, "conversation_id": req.ConversationID, "deleted_at": time.Now()}},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		log.Printf("刪除聊天紀錄寫入失敗: %v", err)
		http.Error(w, "delete conversation failed", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func handleHealth(w http.ResponseWriter, r *http.Request, checkDependencies func(context.Context) error) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if err := checkDependencies(ctx); err != nil {
		log.Printf("health dependency check failed: %v", err)
		http.Error(w, "dependencies unavailable", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(bson.M{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
	}); err != nil {
		log.Printf("健康檢查回應 JSON 失敗: %v", err)
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
	var user userResponse
	err := client.Database(databaseName).Collection(usersName).
		FindOne(ctx, bson.M{"user_id": userID}).
		Decode(&user)
	if err != nil || user.DisplayName == "" {
		return userID
	}

	return user.DisplayName
}

func lookupAvatarURL(ctx context.Context, client *mongo.Client, userID string) string {
	var user userResponse
	if err := client.Database(databaseName).Collection(usersName).FindOne(ctx, bson.M{"user_id": userID}).Decode(&user); err != nil {
		return ""
	}
	return user.AvatarURL
}

func lookupGroupByConversation(ctx context.Context, client *mongo.Client, conversationID string) (groupResponse, error) {
	var group groupResponse
	err := client.Database(databaseName).Collection(groupsName).
		FindOne(ctx, bson.M{"conversation_id": conversationID}).
		Decode(&group)
	return group, err
}

func bsonStringSlice(value interface{}) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case bson.A:
		values := make([]string, 0, len(typed))
		for _, item := range typed {
			if text, ok := item.(string); ok {
				values = append(values, text)
			}
		}
		return values
	case []interface{}:
		values := make([]string, 0, len(typed))
		for _, item := range typed {
			if text, ok := item.(string); ok {
				values = append(values, text)
			}
		}
		return values
	default:
		return nil
	}
}

func uniqueNonEmptyStrings(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		normalized := strings.TrimSpace(value)
		if normalized == "" || seen[normalized] {
			continue
		}
		seen[normalized] = true
		result = append(result, normalized)
	}
	sort.Strings(result)
	return result
}

func stringSliceContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
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
	filter := bson.M{
		"conversation_id": conversationID,
		"recipient_id":    userID,
		"read_at":         nil,
	}
	if strings.HasPrefix(conversationID, "group:") {
		filter = bson.M{
			"conversation_id": conversationID,
			"participant_ids": userID,
			"sender_id":       bson.M{"$ne": userID},
			"read_by":         bson.M{"$ne": userID},
		}
	}
	count, err := client.Database(databaseName).Collection(collectionName).CountDocuments(ctx, filter)
	if err != nil {
		log.Printf("未讀訊息計算失敗: %v", err)
		return 0
	}

	return count
}

func populateUnreadCounts(ctx context.Context, client *mongo.Client, userID string, conversations []conversationResponse) {
	for index := range conversations {
		conversations[index].UnreadCount = countUnreadMessages(ctx, client, userID, conversations[index].ConversationID)
	}
}

func conversationIncludesUser(ctx context.Context, client *mongo.Client, conversationID string, userID string) bool {
	if strings.HasPrefix(conversationID, "group:") {
		group, err := lookupGroupByConversation(ctx, client, conversationID)
		return err == nil && stringSliceContains(group.MemberIDs, userID)
	}

	for _, part := range strings.Split(conversationID, ":") {
		if part == userID {
			return true
		}
	}

	return false
}

func markConversationRead(ctx context.Context, client *mongo.Client, userID string, conversationID string) {
	collection := client.Database(databaseName).Collection(collectionName)
	if strings.HasPrefix(conversationID, "group:") {
		_, err := collection.UpdateMany(
			ctx,
			bson.M{
				"conversation_id": conversationID,
				"participant_ids": userID,
				"sender_id":       bson.M{"$ne": userID},
				"read_by":         bson.M{"$ne": userID},
			},
			bson.M{"$addToSet": bson.M{"read_by": userID}},
		)
		if err != nil {
			log.Printf("群組標記已讀失敗: %v", err)
		}
		return
	}

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
	case groupsName:
		return "group_added"
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
	healthCheck := func(ctx context.Context) error {
		if err := client.Ping(ctx, nil); err != nil {
			return fmt.Errorf("mongo ping: %w", err)
		}
		if err := redisClient.Ping(ctx).Err(); err != nil {
			return fmt.Errorf("redis ping: %w", err)
		}
		return nil
	}
	presence := NewPresenceStore(redisClient, client)
	sessions := NewSessionStore(redisClient)
	blackjack := NewBlackjackStore(redisClient)
	authenticateSession := func(ctx context.Context, token string) (string, error) {
		userID, err := sessions.Authenticate(ctx, token)
		if err != nil {
			if !errors.Is(err, redis.Nil) {
				return "", fmt.Errorf("%w: redis session lookup", errAuthenticationUnavailable)
			}
			return "", err
		}
		exists, err := userExists(ctx, client, userID)
		if err != nil {
			return "", fmt.Errorf("%w: mongo user lookup", errAuthenticationUnavailable)
		}
		if !exists {
			sessions.Delete(ctx, token)
			return "", mongo.ErrNoDocuments
		}
		return userID, nil
	}
	hubCtx, stopHub := context.WithCancel(context.Background())
	defer stopHub()
	hub := newChangeStreamHub(client, blackjack)
	go hub.run(hubCtx)
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				_, err := blackjack.ExpireDue(hubCtx, time.Now())
				if err != nil {
					log.Printf("Redis 21 點逾時處理失敗: %v", err)
					continue
				}
				hub.syncActiveBlackjackGames(hubCtx)
			case <-hubCtx.Done():
				return
			}
		}
	}()
	voiceSubscription := redisClient.Subscribe(hubCtx, voiceSignalsChannel)
	if _, err := voiceSubscription.Receive(ctx); err != nil {
		return err
	}
	defer voiceSubscription.Close()
	go runVoiceSignals(hub, voiceSubscription)
	blackjackSubscription := redisClient.Subscribe(hubCtx, blackjackEventsChannel)
	if _, err := blackjackSubscription.Receive(ctx); err != nil {
		return err
	}
	defer blackjackSubscription.Close()
	go runBlackjackEvents(hub, blackjackSubscription)

	mux := http.NewServeMux()
	mux.HandleFunc("/auth/register", func(w http.ResponseWriter, r *http.Request) {
		handleRegister(w, r, client, sessions)
	})
	mux.HandleFunc("/auth/login", func(w http.ResponseWriter, r *http.Request) {
		handleLogin(w, r, client, sessions)
	})
	mux.HandleFunc("/auth/logout", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleLogout(w, r, sessions)
	}))
	mux.HandleFunc("/auth/me", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleMe(w, r, client)
	}))
	mux.HandleFunc("/auth/avatar", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleUpdateAvatar(w, r, client)
	}))
	mux.HandleFunc("/auth/ws-ticket", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleWSTicket(w, r, sessions)
	}))
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handleConnections(w, r, client, redisClient, sessions, presence, hub)
	})
	mux.HandleFunc("/users", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleUsers(w, r, client)
	}))
	mux.HandleFunc("/friends", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleFriends(w, r, client, hub)
	}))
	mux.HandleFunc("/friends/delete", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleDeleteFriend(w, r, client)
	}))
	mux.HandleFunc("/friend-requests", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleFriendRequests(w, r, client)
	}))
	mux.HandleFunc("/groups", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleGroups(w, r, client, hub)
	}))
	mux.HandleFunc("/groups/leave", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleLeaveGroup(w, r, client)
	}))
	mux.HandleFunc("/messages", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleMessages(w, r, client)
	}))
	mux.HandleFunc("/conversations", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleConversations(w, r, client)
	}))
	mux.HandleFunc("/conversations/delete", withSessionAuth(authenticateSession, func(w http.ResponseWriter, r *http.Request) {
		handleDeleteConversation(w, r, client)
	}))
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		handleHealth(w, r, healthCheck)
	})
	registerAdminRoutes(mux, client, redisClient, cfg.AdminToken)

	fmt.Printf("Go WebSocket 伺服器啟動於 %s\n", cfg.ServerAddr)
	return http.ListenAndServe(cfg.ServerAddr, mux)
}
