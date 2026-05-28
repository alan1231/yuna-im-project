package chat

import "testing"

func TestLoadConfigUsesDefaults(t *testing.T) {
	t.Setenv("MONGO_URI", "")
	t.Setenv("REDIS_ADDR", "")
	t.Setenv("REDIS_PASSWORD", "")
	t.Setenv("ADMIN_TOKEN", "")
	t.Setenv("DATABASE_NAME", "")
	t.Setenv("SERVER_ADDR", "")
	t.Setenv("ALLOWED_ORIGINS", "")

	cfg := LoadConfig()

	if cfg.MongoURI != defaultMongoURI {
		t.Fatalf("MongoURI = %q, want %q", cfg.MongoURI, defaultMongoURI)
	}
	if cfg.RedisAddr != defaultRedisAddr {
		t.Fatalf("RedisAddr = %q, want %q", cfg.RedisAddr, defaultRedisAddr)
	}
	if cfg.RedisPassword != "" {
		t.Fatalf("RedisPassword = %q, want empty", cfg.RedisPassword)
	}
	if cfg.AdminToken != "" {
		t.Fatalf("AdminToken = %q, want empty", cfg.AdminToken)
	}
	if cfg.DatabaseName != defaultDatabaseName {
		t.Fatalf("DatabaseName = %q, want %q", cfg.DatabaseName, defaultDatabaseName)
	}
	if cfg.ServerAddr != defaultServerAddr {
		t.Fatalf("ServerAddr = %q, want %q", cfg.ServerAddr, defaultServerAddr)
	}
	if cfg.AllowedOrigins != defaultAllowedOrigins {
		t.Fatalf("AllowedOrigins = %q, want %q", cfg.AllowedOrigins, defaultAllowedOrigins)
	}
}

func TestLoadConfigUsesEnvironment(t *testing.T) {
	t.Setenv("MONGO_URI", "mongodb://mongo:27017")
	t.Setenv("REDIS_ADDR", "redis:6379")
	t.Setenv("REDIS_PASSWORD", "secret")
	t.Setenv("ADMIN_TOKEN", "admin-secret")
	t.Setenv("DATABASE_NAME", "chat_test")
	t.Setenv("SERVER_ADDR", ":9090")
	t.Setenv("ALLOWED_ORIGINS", "http://localhost:5173")

	cfg := LoadConfig()

	if cfg.MongoURI != "mongodb://mongo:27017" {
		t.Fatalf("MongoURI = %q", cfg.MongoURI)
	}
	if cfg.RedisAddr != "redis:6379" {
		t.Fatalf("RedisAddr = %q", cfg.RedisAddr)
	}
	if cfg.RedisPassword != "secret" {
		t.Fatalf("RedisPassword = %q", cfg.RedisPassword)
	}
	if cfg.AdminToken != "admin-secret" {
		t.Fatalf("AdminToken = %q", cfg.AdminToken)
	}
	if cfg.DatabaseName != "chat_test" {
		t.Fatalf("DatabaseName = %q", cfg.DatabaseName)
	}
	if cfg.ServerAddr != ":9090" {
		t.Fatalf("ServerAddr = %q", cfg.ServerAddr)
	}
	if cfg.AllowedOrigins != "http://localhost:5173" {
		t.Fatalf("AllowedOrigins = %q", cfg.AllowedOrigins)
	}
}
