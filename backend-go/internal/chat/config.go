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
	RedisPassword  string
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
		RedisPassword:  strings.TrimSpace(os.Getenv("REDIS_PASSWORD")),
		DatabaseName:   envOrDefault("DATABASE_NAME", defaultDatabaseName),
		ServerAddr:     envOrDefault("SERVER_ADDR", defaultServerAddr),
		AllowedOrigins: envOrDefault("ALLOWED_ORIGINS", defaultAllowedOrigins),
		AdminToken:     strings.TrimSpace(os.Getenv("ADMIN_TOKEN")),
	}
}

func envOrDefault(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}
