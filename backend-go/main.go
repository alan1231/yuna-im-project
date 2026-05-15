package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	mongoURI           = "mongodb://localhost:27017/?directConnection=true"
	databaseName       = "yuna_chat"
	collectionName     = "messages"
	usersName          = "users"
	friendsName        = "friends"
	friendRequestsName = "friend_requests"
	serverAddr         = ":8080"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type createUserRequest struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
}

type userResponse struct {
	UserID      string    `json:"user_id"`
	DisplayName string    `json:"display_name"`
	CreatedAt   time.Time `json:"created_at"`
}

type createFriendRequest struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
}

type friendResponse struct {
	UserID      string    `json:"user_id" bson:"user_id"`
	FriendID    string    `json:"friend_id" bson:"friend_id"`
	DisplayName string    `json:"display_name" bson:"display_name"`
	CreatedAt   time.Time `json:"created_at" bson:"created_at"`
}

type friendRequestResponse struct {
	RequestID       string    `json:"request_id" bson:"request_id"`
	FromUserID      string    `json:"from_user_id" bson:"from_user_id"`
	FromDisplayName string    `json:"from_display_name" bson:"from_display_name"`
	ToUserID        string    `json:"to_user_id" bson:"to_user_id"`
	ToDisplayName   string    `json:"to_display_name" bson:"to_display_name"`
	Status          string    `json:"status" bson:"status"`
	CreatedAt       time.Time `json:"created_at" bson:"created_at"`
}

type respondFriendRequest struct {
	UserID    string `json:"user_id"`
	RequestID string `json:"request_id"`
	Accept    bool   `json:"accept"`
}

type websocketEvent struct {
	Type    string `json:"type"`
	Payload bson.M `json:"payload"`
}

func conversationIDFor(userA string, userB string) string {
	ids := []string{strings.TrimSpace(userA), strings.TrimSpace(userB)}
	sort.Strings(ids)
	return fmt.Sprintf("dm:%s:%s", ids[0], ids[1])
}

func applyCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func handleUsers(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
	applyCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

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
	update := bson.M{
		"$set": bson.M{
			"display_name": req.DisplayName,
			"updated_at":   now,
		},
		"$setOnInsert": bson.M{
			"user_id":    req.UserID,
			"created_at": now,
		},
	}
	_, err := collection.UpdateOne(
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

func handleConnections(w http.ResponseWriter, r *http.Request, client *mongo.Client) {
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

	fmt.Printf("Vue 前端已連線: user_id=%s conversation_id=%s\n", userID, conversationID)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	go watchAndPush(ctx, ws, client, userID, conversationID)

	collection := client.Database(databaseName).Collection(collectionName)

	for {
		var msg bson.M
		if err := ws.ReadJSON(&msg); err != nil {
			log.Printf("WebSocket 連線結束: %v", err)
			return
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

		if _, err := collection.InsertOne(ctx, msg); err != nil {
			log.Printf("訊息寫入 MongoDB 失敗: %v", err)
			return
		}

		fmt.Printf("收到訊息並存入資料庫: %v\n", msg["text"])
	}
}

func watchAndPush(ctx context.Context, ws *websocket.Conn, client *mongo.Client, userID string, conversationID string) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.D{
			{Key: "operationType", Value: "insert"},
			{Key: "$or", Value: bson.A{
				bson.D{
					{Key: "ns.coll", Value: collectionName},
					{Key: "$or", Value: bson.A{
						bson.D{{Key: "fullDocument.sender_id", Value: userID}},
						bson.D{{Key: "fullDocument.recipient_id", Value: userID}},
						bson.D{{Key: "fullDocument.conversation_id", Value: conversationID}},
					}},
				},
				bson.D{
					{Key: "ns.coll", Value: friendRequestsName},
					{Key: "fullDocument.to_user_id", Value: userID},
					{Key: "fullDocument.status", Value: "pending"},
				},
				bson.D{
					{Key: "ns.coll", Value: friendsName},
					{Key: "fullDocument.user_id", Value: userID},
				},
			}},
		}}},
	}

	stream, err := client.Database(databaseName).Watch(ctx, pipeline)
	if err != nil {
		log.Printf("無法監控 MongoDB Change Stream: %v", err)
		return
	}
	defer stream.Close(ctx)

	for stream.Next(ctx) {
		var event struct {
			Namespace struct {
				Collection string `bson:"coll"`
			} `bson:"ns"`
			FullDocument bson.M `bson:"fullDocument"`
		}

		if err := stream.Decode(&event); err != nil {
			log.Printf("Change Stream 事件解析失敗: %v", err)
			continue
		}

		eventType := websocketEventType(event.Namespace.Collection)
		if eventType == "" {
			continue
		}

		if err := ws.WriteJSON(websocketEvent{
			Type:    eventType,
			Payload: event.FullDocument,
		}); err != nil {
			log.Printf("WebSocket 推播失敗: %v", err)
			return
		}

		fmt.Printf("已即時推播 %s 到前端\n", eventType)
	}

	if err := stream.Err(); err != nil && ctx.Err() == nil {
		log.Printf("MongoDB Change Stream 中斷: %v", err)
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

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatal(err)
	}
	defer client.Disconnect(context.Background())

	if err := client.Ping(ctx, nil); err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handleConnections(w, r, client)
	})
	http.HandleFunc("/users", func(w http.ResponseWriter, r *http.Request) {
		handleUsers(w, r, client)
	})
	http.HandleFunc("/friends", func(w http.ResponseWriter, r *http.Request) {
		handleFriends(w, r, client)
	})
	http.HandleFunc("/friend-requests", func(w http.ResponseWriter, r *http.Request) {
		handleFriendRequests(w, r, client)
	})

	fmt.Printf("Go WebSocket 伺服器啟動於 %s\n", serverAddr)
	log.Fatal(http.ListenAndServe(serverAddr, nil))
}
