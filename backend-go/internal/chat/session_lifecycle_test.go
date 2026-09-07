package chat

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestWSSessionLifecycle(t *testing.T) {
	for _, mode := range []string{"logout", "admin", "expiry", "owner"} {
		t.Run(mode, func(t *testing.T) {
			server := miniredis.RunT(t)
			client := redis.NewClient(&redis.Options{Addr: server.Addr()})
			defer client.Close()
			otherClient := redis.NewClient(&redis.Options{Addr: server.Addr()})
			defer otherClient.Close()
			store, remote := NewSessionStore(client), NewSessionStore(otherClient)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			token, err := store.Create(ctx, "user")
			if err != nil {
				t.Fatal(err)
			}
			otherToken, err := store.Create(ctx, "other")
			if err != nil {
				t.Fatal(err)
			}
			siblingToken, err := store.Create(ctx, "user")
			if err != nil {
				t.Fatal(err)
			}
			ticket, err := store.CreateWSTicket(ctx, "user", token)
			if err != nil {
				t.Fatal(err)
			}
			pendingTicket, err := store.CreateWSTicket(ctx, "user", token)
			if err != nil {
				t.Fatal(err)
			}
			session, err := store.ConsumeWSTicket(ctx, ticket)
			if err != nil {
				t.Fatal(err)
			}
			if session.SessionKey != sessionKey(token) {
				t.Fatal("session binding lost")
			}
			if _, err := store.ConsumeWSTicket(ctx, ticket); err == nil {
				t.Fatal("ticket reused")
			}
			switch mode {
			case "logout":
				err = remote.Delete(ctx, token)
			case "admin":
				err = remote.DeleteAllForUser(ctx, "user")
			case "expiry":
				server.FastForward(sessionTTL)
			case "owner":
				err = client.Set(ctx, session.SessionKey, "other", sessionTTL).Err()
			}
			if err != nil {
				t.Fatal(err)
			}
			// This is also the post-registration check for revocation during a handshake.
			if err := store.ValidateWSSession(ctx, session); err == nil {
				t.Fatal("revoked session accepted")
			}
			if _, err := store.ConsumeWSTicket(ctx, pendingTicket); err == nil {
				t.Fatal("revoked pending ticket accepted")
			}
			closed := make(chan struct{})
			go watchWebSocketAccess(ctx, func(ctx context.Context) error {
				return store.ValidateWSSession(ctx, session)
			}, func() { close(closed) }, time.Millisecond)
			select {
			case <-closed:
			case <-time.After(time.Second):
				t.Fatal("remote revocation did not close socket")
			}
			if mode != "expiry" {
				if _, err := store.Authenticate(ctx, otherToken); err != nil {
					t.Fatal("unrelated session revoked", err)
				}
			}
			if mode == "logout" {
				if _, err := store.Authenticate(ctx, siblingToken); err != nil {
					t.Fatal("logout revoked another session of the same user", err)
				}
			} else if mode == "admin" {
				if _, err := store.Authenticate(ctx, siblingToken); err == nil {
					t.Fatal("admin revocation left a sibling session active")
				}
			}
		})
	}
}

func TestWatchWebSocketAccessStopsOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	done := make(chan struct{})
	go func() {
		watchWebSocketAccess(ctx, func(context.Context) error { t.Error("unexpected validation"); return nil },
			func() { t.Error("unexpected close") }, time.Hour)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("watchdog leaked")
	}
}

func TestWatchWebSocketAccessFailsClosed(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	closed := make(chan struct{})
	go watchWebSocketAccess(ctx, func(checkCtx context.Context) error {
		if _, ok := checkCtx.Deadline(); !ok {
			t.Error("access check has no deadline")
		}
		return errors.New("dependency unavailable")
	}, func() { close(closed) }, time.Millisecond)
	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("dependency failure left connection open")
	}
}
