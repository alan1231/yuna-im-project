package chat

import "testing"

func TestPresenceKeys(t *testing.T) {
	userID := "user_a"

	if got := presenceConnectionsKey(userID); got != "presence:user_a:connections" {
		t.Fatalf("presenceConnectionsKey() = %q", got)
	}
	if got := presenceOnlineKey(userID); got != "presence:user_a:online" {
		t.Fatalf("presenceOnlineKey() = %q", got)
	}
}
