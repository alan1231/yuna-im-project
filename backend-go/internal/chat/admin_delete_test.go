package chat

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func TestAdminDeleteRetry(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	for _, concurrentWinner := range []bool{false, true} {
		name := "transaction failure remains resumable"
		if concurrentWinner {
			name = "write conflict retries after concurrent winner"
		}
		mt.Run(name, func(mt *mtest.T) {
			r := miniredis.RunT(mt)
			client := redis.NewClient(&redis.Options{Addr: r.Addr()})
			defer client.Close()
			admin := &adminServer{mongo: mt.Client, sessions: NewSessionStore(client),
				presence: NewPresenceStore(client, mt.Client), hub: &changeStreamHub{}}
			premark := mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.M{"user_id": "u", "status": "deleting", "disabled": true}})
			failure := mtest.CommandError{Code: 2, Message: "transaction failed"}
			if concurrentWinner {
				failure = mtest.CommandError{Code: 112, Message: "write conflict", Labels: []string{"TransientTransactionError"}}
			}
			mt.AddMockResponses(premark, mtest.CreateSuccessResponse(),
				mtest.CreateCommandErrorResponse(failure), mtest.CreateSuccessResponse()) // abort
			if concurrentWinner {
				mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 0}), mtest.CreateSuccessResponse())
			} else {
				mt.AddMockResponses(mtest.CreateSuccessResponse()) // incomplete audit
			}
			request := func() int {
				w := httptest.NewRecorder()
				admin.handleDeleteUser(w, httptest.NewRequest(http.MethodDelete, "/admin/users?user_id=u", nil))
				return w.Code
			}
			want := 500
			if concurrentWinner {
				want = 204
			}
			if got := request(); got != want {
				mt.Fatalf("status = %d, want %d", got, want)
			}
			for _, e := range mt.GetAllStartedEvents() {
				if e.CommandName == "insert" {
					result := e.Command.Lookup("documents").Array().Index(0).Value().Document().Lookup("result").StringValue()
					if concurrentWinner || result != "incomplete" {
						mt.Fatalf("unexpected audit: %s", result)
					}
				}
			}
			if !concurrentWinner {
				// Retry still accepts the premarked document; another request has now
				// finished deletion before this transaction claims it.
				mt.AddMockResponses(premark, mtest.CreateSuccessResponse(),
					mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 0}), mtest.CreateSuccessResponse())
				if got := request(); got != 204 {
					mt.Fatalf("retry status = %d", got)
				}
			}
		})
	}
	mt.Run("cleanup failure can resume and audit commits with deletion", func(mt *mtest.T) {
		r := miniredis.RunT(mt)
		client := redis.NewClient(&redis.Options{Addr: r.Addr()})
		defer client.Close()
		admin := &adminServer{mongo: mt.Client, sessions: NewSessionStore(client),
			presence: NewPresenceStore(client, mt.Client), hub: &changeStreamHub{}}
		premark := mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.M{
			"user_id": "u", "display_name": "User", "disabled": true, "status": "deleting",
		}})
		request := func() int {
			w := httptest.NewRecorder()
			admin.handleDeleteUser(w, httptest.NewRequest(http.MethodDelete, "/admin/users?user_id=u", nil))
			return w.Code
		}
		r.SetError("cleanup unavailable")
		mt.AddMockResponses(premark, mtest.CreateSuccessResponse())
		if got := request(); got != 500 {
			mt.Fatalf("cleanup failure status = %d", got)
		}
		r.SetError("")
		mt.ClearEvents()
		mt.AddMockResponses(premark,
			mtest.CreateSuccessResponse(),                           // presence snapshot
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}), // transactional claim
			mtest.CreateSuccessResponse(), mtest.CreateSuccessResponse(),
			mtest.CreateSuccessResponse(), mtest.CreateSuccessResponse(),
			mtest.CreateCursorResponse(0, databaseName+"."+groupsName, mtest.FirstBatch),
			mtest.CreateSuccessResponse(), mtest.CreateSuccessResponse(), // cleanup, audit
			mtest.CreateSuccessResponse()) // commit
		if got := request(); got != 204 {
			mt.Fatalf("retry status = %d", got)
		}
		events := mt.GetAllStartedEvents()
		if events[0].Command.Lookup("query").Document().Lookup("status").Type != 0 {
			mt.Fatal("premark must accept deleting users")
		}
		for _, e := range events {
			if e.CommandName == "insert" && e.Command.Lookup("autocommit").Type == 0 {
				mt.Fatal("success audit must be in transaction")
			}
		}
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: nil}))
		if got := request(); got != 204 {
			mt.Fatalf("already deleted status = %d", got)
		}
	})
	mt.Run("enable cannot change deleting document", func(mt *mtest.T) {
		r := miniredis.RunT(mt)
		client := redis.NewClient(&redis.Options{Addr: r.Addr()})
		defer client.Close()
		admin := &adminServer{mongo: mt.Client, sessions: NewSessionStore(client)}
		mt.AddMockResponses(mtest.CreateCursorResponse(0, databaseName+"."+usersName, mtest.FirstBatch,
			bson.D{{Key: "user_id", Value: "u"}, {Key: "status", Value: "deleting"}}),
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 0}))
		w := httptest.NewRecorder()
		admin.handleUserStatus(w, httptest.NewRequest(http.MethodPost, "/admin/users/status", strings.NewReader(`{"user_id":"u","disabled":false}`)))
		if w.Code != 409 {
			mt.Fatalf("enable status = %d", w.Code)
		}
		update := mt.GetAllStartedEvents()[1].Command.Lookup("updates").Array().Index(0).Value().Document()
		if update.Lookup("q", "status", "$ne").StringValue() != "deleting" {
			mt.Fatal("missing atomic enable guard")
		}
	})
}
