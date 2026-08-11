package chat

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
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

func TestHandleHealthChecksDependencies(t *testing.T) {
	tests := []struct {
		name       string
		check      func(context.Context) error
		wantStatus int
	}{
		{name: "available", check: func(context.Context) error { return nil }, wantStatus: http.StatusOK},
		{name: "unavailable", check: func(context.Context) error { return errors.New("offline") }, wantStatus: http.StatusServiceUnavailable},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/health", nil)

			handleHealth(response, request, test.check)

			if response.Code != test.wantStatus {
				t.Fatalf("health status = %d, want %d", response.Code, test.wantStatus)
			}
		})
	}
}

func TestDeliverVoiceSignalTargetsRecipient(t *testing.T) {
	hub := newChangeStreamHub(nil)
	recipient := newWSClient("user_b", "dm:user_a:user_b")
	other := newWSClient("user_c", "dm:user_a:user_c")
	hub.register(recipient)
	hub.register(other)

	payload := []byte(`{"recipient_id":"user_b","event":{"type":"voice_offer","payload":{"sender_id":"user_a"}}}`)
	if err := deliverVoiceSignalPayload(hub, payload); err != nil {
		t.Fatalf("deliverVoiceSignalPayload() error = %v", err)
	}

	select {
	case event := <-recipient.send:
		if event.Type != "voice_offer" {
			t.Fatalf("recipient event type = %q", event.Type)
		}
	default:
		t.Fatal("recipient did not receive voice signal")
	}
	select {
	case event := <-other.send:
		t.Fatalf("other user unexpectedly received %#v", event)
	default:
	}
}

func TestChronologicalMessagesReversesNewestFirstResults(t *testing.T) {
	messages := []bson.M{{"text": "newest"}, {"text": "middle"}, {"text": "oldest"}}

	chronologicalMessages(messages)

	if messages[0]["text"] != "oldest" || messages[1]["text"] != "middle" || messages[2]["text"] != "newest" {
		t.Fatalf("messages = %#v, want oldest to newest", messages)
	}
}
