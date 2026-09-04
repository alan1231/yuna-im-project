package chat

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminTokenFromRequestHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin/stats", nil)
	req.Header.Set("X-Admin-Token", "secret")

	if got := adminTokenFromRequest(req); got != "secret" {
		t.Fatalf("token = %q, want secret", got)
	}
}

func TestAdminTokenFromRequestBearer(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin/stats", nil)
	req.Header.Set("Authorization", "Bearer secret")

	if got := adminTokenFromRequest(req); got != "secret" {
		t.Fatalf("token = %q, want secret", got)
	}
}

func TestAdminTokenFromRequestEmpty(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin/stats", nil)

	if got := adminTokenFromRequest(req); got != "" {
		t.Fatalf("token = %q, want empty", got)
	}
}

func TestParseAdminLimit(t *testing.T) {
	if got := parseAdminLimit("", 100, 500); got != 100 {
		t.Fatalf("empty limit = %d, want 100", got)
	}
	if got := parseAdminLimit("25", 100, 500); got != 25 {
		t.Fatalf("limit 25 = %d, want 25", got)
	}
	if got := parseAdminLimit("900", 100, 500); got != 500 {
		t.Fatalf("limit 900 = %d, want 500", got)
	}
	if got := parseAdminLimit("-1", 100, 500); got != 100 {
		t.Fatalf("limit -1 = %d, want 100", got)
	}
}

func TestParseAdminOffset(t *testing.T) {
	if got := parseAdminOffset("50"); got != 50 {
		t.Fatalf("offset = %d, want 50", got)
	}
	if got := parseAdminOffset("-1"); got != 0 {
		t.Fatalf("negative offset = %d, want 0", got)
	}
}

func TestParseAdminSearchQuery(t *testing.T) {
	got, err := parseAdminSearchQuery("  user.*[1]  ")
	if err != nil {
		t.Fatal(err)
	}
	if got != `user\.\*\[1\]` {
		t.Fatalf("query = %q, want escaped literal", got)
	}

	if _, err := parseAdminSearchQuery(string(make([]rune, 101))); err == nil {
		t.Fatal("query longer than 100 characters should fail")
	}
}

func TestMapKeys(t *testing.T) {
	keys := mapKeys(map[string]bool{
		"user_a": true,
		"user_b": true,
	})

	if len(keys) != 2 {
		t.Fatalf("len(keys) = %d, want 2", len(keys))
	}

	got := map[string]bool{}
	for _, key := range keys {
		got[key] = true
	}
	if !got["user_a"] || !got["user_b"] {
		t.Fatalf("keys = %#v", keys)
	}
}

func TestRemoveString(t *testing.T) {
	got := removeString([]string{"user_a", "user_b", "user_a"}, "user_a")
	if len(got) != 1 || got[0] != "user_b" {
		t.Fatalf("removeString() = %#v, want [user_b]", got)
	}
}
