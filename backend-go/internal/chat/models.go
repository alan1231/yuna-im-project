package chat

import (
	"time"

	"go.mongodb.org/mongo-driver/bson"
)

type userResponse struct {
	UserID      string    `json:"user_id" bson:"user_id"`
	DisplayName string    `json:"display_name" bson:"display_name"`
	CreatedAt   time.Time `json:"created_at" bson:"created_at"`
	Online      bool      `json:"online" bson:"online"`
	LastSeen    time.Time `json:"last_seen" bson:"last_seen"`
}

type createFriendRequest struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
}

type deleteFriendRequest struct {
	UserID   string `json:"user_id"`
	FriendID string `json:"friend_id"`
}

type deleteConversationRequest struct {
	UserID         string `json:"user_id"`
	ConversationID string `json:"conversation_id"`
}

type friendResponse struct {
	UserID      string    `json:"user_id" bson:"user_id"`
	FriendID    string    `json:"friend_id" bson:"friend_id"`
	DisplayName string    `json:"display_name" bson:"display_name"`
	CreatedAt   time.Time `json:"created_at" bson:"created_at"`
	Online      bool      `json:"online" bson:"online"`
	LastSeen    time.Time `json:"last_seen" bson:"last_seen"`
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

type createGroupRequest struct {
	UserID    string   `json:"user_id"`
	Name      string   `json:"name"`
	MemberIDs []string `json:"member_ids"`
}

type leaveGroupRequest struct {
	UserID  string `json:"user_id"`
	GroupID string `json:"group_id"`
}

type groupResponse struct {
	GroupID        string    `json:"group_id" bson:"group_id"`
	Name           string    `json:"name" bson:"name"`
	MemberIDs      []string  `json:"member_ids" bson:"member_ids"`
	ConversationID string    `json:"conversation_id" bson:"conversation_id"`
	CreatedBy      string    `json:"created_by" bson:"created_by"`
	CreatedAt      time.Time `json:"created_at" bson:"created_at"`
}

type websocketEvent struct {
	Type    string `json:"type"`
	Payload bson.M `json:"payload"`
}

type conversationResponse struct {
	ConversationID      string     `json:"conversation_id"`
	RecipientID         string     `json:"recipient_id"`
	DisplayName         string     `json:"display_name"`
	LastMessage         string     `json:"last_message"`
	LastMessageAt       time.Time  `json:"last_message_at"`
	LastMessageSenderID string     `json:"last_message_sender_id"`
	LastMessageReadAt   *time.Time `json:"last_message_read_at"`
	IsFriend            bool       `json:"is_friend"`
	IsGroup             bool       `json:"is_group"`
	MemberIDs           []string   `json:"member_ids,omitempty"`
	UnreadCount         int64      `json:"unread_count"`
}
