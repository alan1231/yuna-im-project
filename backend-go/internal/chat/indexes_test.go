package chat

import (
	"testing"

	"go.mongodb.org/mongo-driver/mongo"
)

func TestMessageIndexes(t *testing.T) {
	assertIndexNames(t, messageIndexes(), []string{
		"conversation_time",
		"sender_time_desc",
		"recipient_time_desc",
		"participant_time_desc",
		"conversation_recipient_read",
	})
}

func TestUserIndexes(t *testing.T) {
	indexes := userIndexes()
	assertIndexNames(t, indexes, []string{
		"user_id_unique",
		"display_name",
	})
	assertUniqueIndex(t, indexes, "user_id_unique")
}

func TestFriendIndexes(t *testing.T) {
	indexes := friendIndexes()
	assertIndexNames(t, indexes, []string{
		"user_friend_unique",
		"user_created_at",
	})
	assertUniqueIndex(t, indexes, "user_friend_unique")
}

func TestFriendRequestIndexes(t *testing.T) {
	indexes := friendRequestIndexes()
	assertIndexNames(t, indexes, []string{
		"request_id_unique",
		"from_to_status",
		"to_status_created_at",
	})
	assertUniqueIndex(t, indexes, "request_id_unique")
}

func assertIndexNames(t *testing.T, indexes []mongo.IndexModel, want []string) {
	t.Helper()
	if len(indexes) != len(want) {
		t.Fatalf("index count = %d, want %d", len(indexes), len(want))
	}

	got := map[string]bool{}
	for _, index := range indexes {
		if index.Options == nil || index.Options.Name == nil {
			t.Fatalf("index missing name: %#v", index)
		}
		got[*index.Options.Name] = true
	}

	for _, name := range want {
		if !got[name] {
			t.Fatalf("missing index %q; got %#v", name, got)
		}
	}
}

func assertUniqueIndex(t *testing.T, indexes []mongo.IndexModel, name string) {
	t.Helper()

	for _, index := range indexes {
		if index.Options == nil || index.Options.Name == nil || *index.Options.Name != name {
			continue
		}
		if index.Options.Unique == nil || !*index.Options.Unique {
			t.Fatalf("index %q is not unique", name)
		}
		return
	}

	t.Fatalf("index %q not found", name)
}
