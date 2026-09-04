package chat

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestWithSessionAuthRejectsMissingBearerToken(t *testing.T) {
	authenticate := func(context.Context, string) (string, error) {
		t.Fatal("authenticate should not be called without a token")
		return "", nil
	}
	handler := withSessionAuth(authenticate, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("protected handler should not run")
	})

	response := httptest.NewRecorder()
	handler(response, httptest.NewRequest(http.MethodGet, "/friends", nil))

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnauthorized)
	}
}

func TestWithSessionAuthUsesAuthenticatedUser(t *testing.T) {
	authenticate := func(_ context.Context, token string) (string, error) {
		if token != "valid-token" {
			return "", errors.New("invalid token")
		}
		return "server-user", nil
	}
	handler := withSessionAuth(authenticate, func(w http.ResponseWriter, r *http.Request) {
		if got := authenticatedUserID(r); got != "server-user" {
			t.Fatalf("authenticatedUserID() = %q, want server-user", got)
		}
		w.WriteHeader(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodGet, "/friends?user_id=attacker", nil)
	request.Header.Set("Authorization", "Bearer valid-token")
	response := httptest.NewRecorder()
	handler(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
	}
}

func TestWithSessionAuthPreservesSessionDuringDependencyFailure(t *testing.T) {
	handler := withSessionAuth(func(context.Context, string) (string, error) {
		return "", errAuthenticationUnavailable
	}, func(http.ResponseWriter, *http.Request) {
		t.Fatal("protected handler should not run")
	})
	request := httptest.NewRequest(http.MethodGet, "/friends", nil)
	request.Header.Set("Authorization", "Bearer valid-token")
	response := httptest.NewRecorder()
	handler(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
}

func TestValidateCredentials(t *testing.T) {
	tests := []struct {
		name        string
		displayName string
		password    string
		wantError   bool
	}{
		{name: "valid", displayName: "Yuna", password: "password123"},
		{name: "blank name", displayName: " ", password: "password123", wantError: true},
		{name: "short password", displayName: "Yuna", password: "1234567", wantError: true},
		{name: "bcrypt limit", displayName: "Yuna", password: strings.Repeat("a", 73), wantError: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateCredentials(test.displayName, test.password)
			if (err != nil) != test.wantError {
				t.Fatalf("validateCredentials() error = %v, wantError %v", err, test.wantError)
			}
		})
	}
}

func TestPasswordHashDoesNotStorePlaintext(t *testing.T) {
	hash, err := hashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	if hash == "password123" || !passwordMatches(hash, "password123") {
		t.Fatal("password was not securely hashed and verified")
	}
	if passwordMatches(hash, "wrong-password") {
		t.Fatal("wrong password matched")
	}
}

func TestSessionKeyDoesNotContainToken(t *testing.T) {
	token := "a-secret-session-token"
	key := sessionKey(token)
	if strings.Contains(key, token) {
		t.Fatalf("session key %q contains the raw token", key)
	}
}

func TestDeleteAllSessionsForUser(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	store := NewSessionStore(client)
	ctx := context.Background()

	first, err := store.Create(ctx, "user_a")
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.Create(ctx, "user_a")
	if err != nil {
		t.Fatal(err)
	}
	other, err := store.Create(ctx, "user_b")
	if err != nil {
		t.Fatal(err)
	}
	legacy := "legacy-token"
	if err := client.Set(ctx, sessionKey(legacy), "user_a", sessionTTL).Err(); err != nil {
		t.Fatal(err)
	}

	if err := store.DeleteAllForUser(ctx, "user_a"); err != nil {
		t.Fatal(err)
	}
	for _, token := range []string{first, second, legacy} {
		if _, err := store.Authenticate(ctx, token); !errors.Is(err, redis.Nil) {
			t.Fatalf("session %q still exists: %v", token, err)
		}
	}
	if got, err := store.Authenticate(ctx, other); err != nil || got != "user_b" {
		t.Fatalf("other user session = %q, %v", got, err)
	}
}

func TestNormalizeLoginName(t *testing.T) {
	if got := normalizeLoginName("  YuNa  "); got != "yuna" {
		t.Fatalf("normalizeLoginName() = %q, want yuna", got)
	}
}

func TestAuthAttemptKeyDoesNotContainIdentity(t *testing.T) {
	identity := "Yuna@example.com"
	key := authAttemptKey("account", identity, time.Unix(120, 0))
	if strings.Contains(key, identity) {
		t.Fatalf("auth attempt key %q contains raw identity", key)
	}
}

func TestClientIPOnlyTrustsForwardingHeaderBehindPrivateProxy(t *testing.T) {
	direct := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	direct.RemoteAddr = "203.0.113.10:1234"
	direct.Header.Set("X-Forwarded-For", "1.1.1.1")
	if got := clientIP(direct); got != "203.0.113.10" {
		t.Fatalf("direct clientIP() = %q", got)
	}

	proxied := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	proxied.RemoteAddr = "10.0.0.2:1234"
	proxied.Header.Set("X-Forwarded-For", "1.1.1.1, 198.51.100.20")
	if got := clientIP(proxied); got != "198.51.100.20" {
		t.Fatalf("proxied clientIP() = %q", got)
	}
}
