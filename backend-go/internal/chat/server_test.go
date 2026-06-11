package chat

import (
	"context"
	"testing"
)

func TestConversationIDForSortsParticipants(t *testing.T) {
	got := conversationIDFor("user_b", "user_a")
	want := "dm:user_a:user_b"

	if got != want {
		t.Fatalf("conversationIDFor() = %q, want %q", got, want)
	}
}

func TestConversationIDForTrimsParticipants(t *testing.T) {
	got := conversationIDFor(" user_b ", " user_a ")
	want := "dm:user_a:user_b"

	if got != want {
		t.Fatalf("conversationIDFor() = %q, want %q", got, want)
	}
}

func TestConversationIncludesUser(t *testing.T) {
	if !conversationIncludesUser(context.Background(), nil, "dm:user_a:user_b", "user_a") {
		t.Fatal("expected conversation to include user_a")
	}
	if conversationIncludesUser(context.Background(), nil, "dm:user_a:user_b", "user_c") {
		t.Fatal("did not expect conversation to include user_c")
	}
}

func TestIsOriginAllowed(t *testing.T) {
	previous := allowedOrigins
	t.Cleanup(func() {
		allowedOrigins = previous
	})

	allowedOrigins = "http://localhost:5173,https://example.com"

	if !isOriginAllowed("https://example.com") {
		t.Fatal("expected configured origin to be allowed")
	}
	if !isOriginAllowed("http://localhost:8081") {
		t.Fatal("expected React Native Metro origin to be allowed")
	}
	if !isOriginAllowed("null") {
		t.Fatal("expected native null origin to be allowed")
	}
	if !isOriginAllowed("react-native://localhost") {
		t.Fatal("expected React Native scheme origin to be allowed")
	}
	if !isOriginAllowed("file://") {
		t.Fatal("expected native file origin to be allowed")
	}
	if isOriginAllowed("https://evil.example") {
		t.Fatal("did not expect unconfigured origin to be allowed")
	}
}
