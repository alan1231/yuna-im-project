package chat

import (
	"os"
	"strings"
)

const (
	defaultMongoURI       = "mongodb://localhost:27017/?directConnection=true"
	defaultRedisAddr      = "localhost:6379"
	defaultDatabaseName   = "yuna_chat"
	defaultServerAddr     = ":8080"
	defaultAllowedOrigins = "*"
)

type Config struct {
	MongoURI       string
	RedisAddr      string
	RedisUsername  string
	RedisPassword  string
	RedisTLS       bool
	DatabaseName   string
	ServerAddr     string
	AllowedOrigins string
	AdminToken     string
}

// LoadConfig centralizes runtime settings so local development, Docker, and
// deployment environments do not require code changes.
func LoadConfig() Config {
	return Config{
		MongoURI:       envOrDefault("MONGO_URI", defaultMongoURI),
		RedisAddr:      envOrDefault("REDIS_ADDR", defaultRedisAddr),
		RedisUsername:  strings.TrimSpace(os.Getenv("REDIS_USERNAME")),
		RedisPassword:  strings.TrimSpace(os.Getenv("REDIS_PASSWORD")),
		RedisTLS:       parseBool(os.Getenv("REDIS_TLS")),
		DatabaseName:   envOrDefault("DATABASE_NAME", defaultDatabaseName),
		ServerAddr:     serverAddress(),
		AllowedOrigins: envOrDefault("ALLOWED_ORIGINS", defaultAllowedOrigins),
		AdminToken:     strings.TrimSpace(os.Getenv("ADMIN_TOKEN")),
	}
}

func serverAddress() string {
	if addr := strings.TrimSpace(os.Getenv("SERVER_ADDR")); addr != "" {
		return addr
	}
	if port := strings.TrimSpace(os.Getenv("PORT")); port != "" {
		return ":" + port
	}
	return defaultServerAddr
}

func envOrDefault(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}

func parseBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
