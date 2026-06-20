package chat

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func ensureIndexes(ctx context.Context, client *mongo.Client) error {
	db := client.Database(databaseName)

	if _, err := db.Collection(collectionName).Indexes().CreateMany(ctx, messageIndexes()); err != nil {
		return err
	}
	if _, err := db.Collection(usersName).Indexes().CreateMany(ctx, userIndexes()); err != nil {
		return err
	}
	if _, err := db.Collection(friendsName).Indexes().CreateMany(ctx, friendIndexes()); err != nil {
		return err
	}
	if _, err := db.Collection(friendRequestsName).Indexes().CreateMany(ctx, friendRequestIndexes()); err != nil {
		return err
	}
	if _, err := db.Collection(groupsName).Indexes().CreateMany(ctx, groupIndexes()); err != nil {
		return err
	}

	return nil
}

func groupIndexes() []mongo.IndexModel {
	return []mongo.IndexModel{
		{
			Keys: bson.D{{Key: "group_id", Value: 1}},
			Options: options.Index().
				SetName("group_id_unique").
				SetUnique(true),
		},
		{
			Keys:    bson.D{{Key: "member_ids", Value: 1}},
			Options: options.Index().SetName("member_ids"),
		},
		{
			Keys:    bson.D{{Key: "conversation_id", Value: 1}},
			Options: options.Index().SetName("conversation_id"),
		},
	}
}

// messageIndexes match the read paths used by chat history, conversation list,
// unread counts, and read receipts.
func messageIndexes() []mongo.IndexModel {
	return []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "conversation_id", Value: 1},
				{Key: "time", Value: 1},
			},
			Options: options.Index().SetName("conversation_time"),
		},
		{
			Keys: bson.D{
				{Key: "sender_id", Value: 1},
				{Key: "time", Value: -1},
			},
			Options: options.Index().SetName("sender_time_desc"),
		},
		{
			Keys: bson.D{
				{Key: "recipient_id", Value: 1},
				{Key: "time", Value: -1},
			},
			Options: options.Index().SetName("recipient_time_desc"),
		},
		{
			Keys: bson.D{
				{Key: "participant_ids", Value: 1},
				{Key: "time", Value: -1},
			},
			Options: options.Index().SetName("participant_time_desc"),
		},
		{
			Keys: bson.D{
				{Key: "conversation_id", Value: 1},
				{Key: "recipient_id", Value: 1},
				{Key: "read_at", Value: 1},
			},
			Options: options.Index().SetName("conversation_recipient_read"),
		},
		{
			Keys: bson.D{
				{Key: "conversation_id", Value: 1},
				{Key: "participant_ids", Value: 1},
				{Key: "sender_id", Value: 1},
				{Key: "read_by", Value: 1},
			},
			Options: options.Index().SetName("conversation_participant_sender_read_by"),
		},
	}
}

// userIndexes keep account lookup stable. display_name is intentionally not
// unique yet because case-insensitive uniqueness needs a normalized field.
func userIndexes() []mongo.IndexModel {
	return []mongo.IndexModel{
		{
			Keys: bson.D{{Key: "user_id", Value: 1}},
			Options: options.Index().
				SetName("user_id_unique").
				SetUnique(true),
		},
		{
			Keys:    bson.D{{Key: "display_name", Value: 1}},
			Options: options.Index().SetName("display_name"),
		},
	}
}

// friendIndexes support both uniqueness of a friend relation and sorted friend
// lists for a single user.
func friendIndexes() []mongo.IndexModel {
	return []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "friend_id", Value: 1},
			},
			Options: options.Index().
				SetName("user_friend_unique").
				SetUnique(true),
		},
		{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "created_at", Value: 1},
			},
			Options: options.Index().SetName("user_created_at"),
		},
	}
}

// friendRequestIndexes cover pending request checks, inbox listing, and request
// lookup during accept/reject flows.
func friendRequestIndexes() []mongo.IndexModel {
	return []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "request_id", Value: 1},
			},
			Options: options.Index().
				SetName("request_id_unique").
				SetUnique(true),
		},
		{
			Keys: bson.D{
				{Key: "from_user_id", Value: 1},
				{Key: "to_user_id", Value: 1},
				{Key: "status", Value: 1},
			},
			Options: options.Index().SetName("from_to_status"),
		},
		{
			Keys: bson.D{
				{Key: "to_user_id", Value: 1},
				{Key: "status", Value: 1},
				{Key: "created_at", Value: 1},
			},
			Options: options.Index().SetName("to_status_created_at"),
		},
	}
}
