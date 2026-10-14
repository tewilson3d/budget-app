package srv

import (
	"encoding/json"
	"net/http"
	"testing"
)

type testState struct {
	Member       string                     `json:"member"`
	Entries      []map[string]any           `json:"entries"`
	BillPayments []map[string]any           `json:"billPayments"`
	Settings     map[string]json.RawMessage `json:"settings"`
}

// getState fetches /api/state as the given member.
func getState(t *testing.T, h http.Handler, email string) testState {
	t.Helper()
	status, body, _ := do(t, h, http.MethodGet, "/api/state", email, "")
	if status != http.StatusOK {
		t.Fatalf("GET /api/state = %d %s", status, body)
	}
	var st testState
	if err := json.Unmarshal([]byte(body), &st); err != nil {
		t.Fatalf("decode state: %v (%s)", err, body)
	}
	return st
}

// mustDo sends a request and fails the test unless it returns wantStatus.
func mustDo(t *testing.T, h http.Handler, method, path, email, body string, wantStatus int) string {
	t.Helper()
	status, resp, _ := do(t, h, method, path, email, body)
	if status != wantStatus {
		t.Fatalf("%s %s = %d %s, want %d", method, path, status, resp, wantStatus)
	}
	return resp
}

func entryIDs(st testState) []string {
	ids := make([]string, 0, len(st.Entries))
	for _, e := range st.Entries {
		ids = append(ids, e["id"].(string))
	}
	return ids
}

func TestServer_HandleState_empty(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()
	status, body, _ := do(t, h, http.MethodGet, "/api/state", memberA, "")
	if status != http.StatusOK {
		t.Fatalf("status = %d", status)
	}
	want := `{"billPayments":[],"entries":[],"member":"a@example.com","settings":null}` + "\n"
	if body != want {
		t.Errorf("body = %s, want %s", body, want)
	}
}

func TestServer_HandlePutEntry_validation(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()

	tests := []struct {
		name       string
		path       string
		body       string
		wantStatus int
	}{
		{name: "valid entry", path: "/api/entries/e1",
			body: `{"id":"e1","date":"2026-10-14","category":"food","amount":120}`, wantStatus: http.StatusOK},
		{name: "id differs from URL", path: "/api/entries/other",
			body: `{"id":"e1","date":"2026-10-14","category":"food","amount":120}`, wantStatus: http.StatusBadRequest},
		{name: "bad date", path: "/api/entries/e2",
			body: `{"id":"e2","date":"14/10/2026","category":"food","amount":120}`, wantStatus: http.StatusBadRequest},
		{name: "unknown category", path: "/api/entries/e3",
			body: `{"id":"e3","date":"2026-10-14","category":"Food","amount":120}`, wantStatus: http.StatusBadRequest},
		{name: "zero amount", path: "/api/entries/e4",
			body: `{"id":"e4","date":"2026-10-14","category":"food","amount":0}`, wantStatus: http.StatusBadRequest},
		{name: "missing amount", path: "/api/entries/e5",
			body: `{"id":"e5","date":"2026-10-14","category":"food"}`, wantStatus: http.StatusBadRequest},
		{name: "not an object", path: "/api/entries/e6", body: `[1,2]`, wantStatus: http.StatusBadRequest},
		{name: "not JSON", path: "/api/entries/e7", body: `amount=5`, wantStatus: http.StatusBadRequest},
		{name: "keys in the wrong case", path: "/api/entries/e8",
			body: `{"ID":"e8","Date":"2026-10-14","Category":"food","Amount":120}`, wantStatus: http.StatusBadRequest},
		{name: "amount as text", path: "/api/entries/e9",
			body: `{"id":"e9","date":"2026-10-14","category":"food","amount":"120"}`, wantStatus: http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			status, body, _ := do(t, h, http.MethodPut, tt.path, memberA, tt.body)
			if status != tt.wantStatus {
				t.Errorf("status = %d %s, want %d", status, body, tt.wantStatus)
			}
		})
	}
}

// The point of the server: what one member logs, the other sees.
func TestServer_HandlePutEntry_sharedBetweenMembers(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()

	mustDo(t, h, http.MethodPut, "/api/entries/e1", memberA,
		`{"id":"e1","date":"2026-10-14","category":"food","amount":120,"note":"lunch","ts":1791974524882}`, http.StatusOK)
	mustDo(t, h, http.MethodPut, "/api/entries/e2", memberB,
		`{"id":"e2","date":"2026-10-13","category":"dogs","amount":300.5}`, http.StatusOK)

	for _, viewer := range []string{memberA, memberB} {
		st := getState(t, h, viewer)
		ids := entryIDs(st)
		// Ordered by date, so e2 (the 13th) comes first.
		if len(ids) != 2 || ids[0] != "e2" || ids[1] != "e1" {
			t.Fatalf("%s sees entries %v, want [e2 e1]", viewer, ids)
		}
		if note := st.Entries[1]["note"]; note != "lunch" {
			t.Errorf("%s: note = %v, want the client's extra fields kept", viewer, note)
		}
		if ts := st.Entries[1]["ts"]; ts != float64(1791974524882) {
			t.Errorf("%s: ts = %v, want 1791974524882", viewer, ts)
		}
	}
}

func TestServer_HandlePutEntry_retryAndEditKeepOneRow(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()
	body := `{"id":"e1","date":"2026-10-14","category":"food","amount":120}`
	mustDo(t, h, http.MethodPut, "/api/entries/e1", memberA, body, http.StatusOK)
	mustDo(t, h, http.MethodPut, "/api/entries/e1", memberA, body, http.StatusOK)
	mustDo(t, h, http.MethodPut, "/api/entries/e1", memberB,
		`{"id":"e1","date":"2026-10-14","category":"food","amount":150}`, http.StatusOK)

	st := getState(t, h, memberA)
	if len(st.Entries) != 1 {
		t.Fatalf("entries = %v, want one row", st.Entries)
	}
	if amt := st.Entries[0]["amount"]; amt != float64(150) {
		t.Errorf("amount = %v, want the later edit (150)", amt)
	}
}

func TestServer_HandleDeleteEntry(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()
	mustDo(t, h, http.MethodPut, "/api/entries/1791974524882-0.5", memberA,
		`{"id":"1791974524882-0.5","date":"2026-10-14","category":"food","amount":120}`, http.StatusOK)

	// One member deletes what the other logged, then a retry of the same delete.
	mustDo(t, h, http.MethodDelete, "/api/entries/1791974524882-0.5", memberB, "", http.StatusOK)
	mustDo(t, h, http.MethodDelete, "/api/entries/1791974524882-0.5", memberB, "", http.StatusOK)

	if st := getState(t, h, memberA); len(st.Entries) != 0 {
		t.Errorf("entries after delete = %v, want none", st.Entries)
	}
}

func TestServer_HandlePutPayment(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()

	tests := []struct {
		name       string
		path       string
		body       string
		wantStatus int
	}{
		{name: "valid payment", path: "/api/payments/phone/2026-10",
			body: `{"billId":"phone","name":"Phone","amount":1500,"month":"2026-10","ts":1}`, wantStatus: http.StatusOK},
		{name: "month differs from URL", path: "/api/payments/phone/2026-09",
			body: `{"billId":"phone","name":"Phone","amount":1500,"month":"2026-10","ts":1}`, wantStatus: http.StatusBadRequest},
		{name: "bill differs from URL", path: "/api/payments/water/2026-10",
			body: `{"billId":"phone","name":"Phone","amount":1500,"month":"2026-10","ts":1}`, wantStatus: http.StatusBadRequest},
		{name: "bad month", path: "/api/payments/phone/2026-13",
			body: `{"billId":"phone","name":"Phone","amount":1500,"month":"2026-13","ts":1}`, wantStatus: http.StatusBadRequest},
		{name: "keys in the wrong case", path: "/api/payments/phone/2026-12",
			body: `{"BillId":"phone","Month":"2026-12","Amount":1}`, wantStatus: http.StatusBadRequest},
		{name: "negative amount", path: "/api/payments/phone/2026-11",
			body: `{"billId":"phone","name":"Phone","amount":-1,"month":"2026-11","ts":1}`, wantStatus: http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, body, _ := do(t, h, http.MethodPut, tt.path, memberA, tt.body)
			if status != tt.wantStatus {
				t.Errorf("status = %d %s, want %d", status, body, tt.wantStatus)
			}
		})
	}

	st := getState(t, h, memberB)
	if len(st.BillPayments) != 1 || st.BillPayments[0]["billId"] != "phone" {
		t.Errorf("billPayments = %v, want just the valid phone payment", st.BillPayments)
	}
}

func TestServer_HandleDeletePayment(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()
	mustDo(t, h, http.MethodPut, "/api/payments/phone/2026-10", memberA,
		`{"billId":"phone","name":"Phone","amount":1500,"month":"2026-10","ts":1}`, http.StatusOK)
	mustDo(t, h, http.MethodPut, "/api/payments/phone/2026-09", memberA,
		`{"billId":"phone","name":"Phone","amount":1500,"month":"2026-09","ts":1}`, http.StatusOK)

	mustDo(t, h, http.MethodDelete, "/api/payments/phone/2026-10", memberB, "", http.StatusOK)

	st := getState(t, h, memberA)
	if len(st.BillPayments) != 1 || st.BillPayments[0]["month"] != "2026-09" {
		t.Errorf("billPayments = %v, want only September left", st.BillPayments)
	}
}

func TestServer_HandlePutSettings(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()

	mustDo(t, h, http.MethodPut, "/api/settings", memberA, `[]`, http.StatusBadRequest)
	mustDo(t, h, http.MethodPut, "/api/settings", memberA, `null`, http.StatusBadRequest)
	mustDo(t, h, http.MethodPut, "/api/settings", memberA,
		`{"dailyBudgets":{"food":1500},"balanceAnchor":null,"bills":[]}`, http.StatusOK)
	mustDo(t, h, http.MethodPut, "/api/settings", memberB,
		`{"dailyBudgets":{"food":1200},"balanceAnchor":{"amount":50000,"ts":2},"bills":[]}`, http.StatusOK)

	st := getState(t, h, memberA)
	if got := string(st.Settings["dailyBudgets"]); got != `{"food":1200}` {
		t.Errorf("dailyBudgets = %s, want the last save to win", got)
	}
	if got := string(st.Settings["balanceAnchor"]); got != `{"amount":50000,"ts":2}` {
		t.Errorf("balanceAnchor = %s", got)
	}
}

func TestServer_HandleImport(t *testing.T) {
	t.Parallel()

	// Each case starts from the same pot: one entry, one payment, settings.
	seed := func(t *testing.T, h http.Handler) {
		t.Helper()
		mustDo(t, h, http.MethodPut, "/api/entries/old", memberA,
			`{"id":"old","date":"2026-09-01","category":"food","amount":100}`, http.StatusOK)
		mustDo(t, h, http.MethodPut, "/api/payments/phone/2026-09", memberA,
			`{"billId":"phone","name":"Phone","amount":1500,"month":"2026-09","ts":1}`, http.StatusOK)
		mustDo(t, h, http.MethodPut, "/api/settings", memberA, `{"dailyBudgets":{"food":1500}}`, http.StatusOK)
	}
	backup := func(mode string) string {
		return `{"mode":"` + mode + `",
			"entries":[
				{"id":"old","date":"2026-09-01","category":"food","amount":999},
				{"id":"new","date":"2026-10-02","category":"household","amount":50}],
			"billPayments":[{"billId":"water","name":"Water","amount":200,"month":"2026-10","ts":5}],
			"settings":{"dailyBudgets":{"food":800}}}`
	}

	tests := []struct {
		name         string
		body         string
		wantStatus   int
		wantEntries  map[string]float64 // id -> amount
		wantBills    []string           // billId/month
		wantFoodDays string
	}{
		{
			name:         "merge adds what is missing and keeps what is there",
			body:         backup("merge"),
			wantStatus:   http.StatusOK,
			wantEntries:  map[string]float64{"old": 100, "new": 50},
			wantBills:    []string{"phone/2026-09", "water/2026-10"},
			wantFoodDays: `{"food":1500}`,
		},
		{
			name:         "replace makes the pot exactly the backup",
			body:         backup("replace"),
			wantStatus:   http.StatusOK,
			wantEntries:  map[string]float64{"old": 999, "new": 50},
			wantBills:    []string{"water/2026-10"},
			wantFoodDays: `{"food":800}`,
		},
		{
			name: "one bad entry rejects the whole import",
			body: `{"mode":"replace","entries":[
				{"id":"fine","date":"2026-10-02","category":"food","amount":5},
				{"id":"bad","date":"2026-10-02","category":"food","amount":-5}]}`,
			wantStatus:   http.StatusBadRequest,
			wantEntries:  map[string]float64{"old": 100},
			wantBills:    []string{"phone/2026-09"},
			wantFoodDays: `{"food":1500}`,
		},
		{
			name:         "unknown mode is refused",
			body:         `{"mode":"overwrite","entries":[]}`,
			wantStatus:   http.StatusBadRequest,
			wantEntries:  map[string]float64{"old": 100},
			wantBills:    []string{"phone/2026-09"},
			wantFoodDays: `{"food":1500}`,
		},
		{
			name:         "merge without settings leaves settings alone",
			body:         `{"mode":"merge","entries":[],"settings":null}`,
			wantStatus:   http.StatusOK,
			wantEntries:  map[string]float64{"old": 100},
			wantBills:    []string{"phone/2026-09"},
			wantFoodDays: `{"food":1500}`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			h := newTestServer(t).Handler()
			seed(t, h)

			status, body, _ := do(t, h, http.MethodPost, "/api/import", memberB, tt.body)
			if status != tt.wantStatus {
				t.Fatalf("status = %d %s, want %d", status, body, tt.wantStatus)
			}

			st := getState(t, h, memberA)
			got := map[string]float64{}
			for _, e := range st.Entries {
				got[e["id"].(string)] = e["amount"].(float64)
			}
			if len(got) != len(tt.wantEntries) {
				t.Errorf("entries = %v, want %v", got, tt.wantEntries)
			}
			for id, amt := range tt.wantEntries {
				if got[id] != amt {
					t.Errorf("entry %s amount = %v, want %v", id, got[id], amt)
				}
			}
			var bills []string
			for _, p := range st.BillPayments {
				bills = append(bills, p["billId"].(string)+"/"+p["month"].(string))
			}
			if len(bills) != len(tt.wantBills) {
				t.Fatalf("bill payments = %v, want %v", bills, tt.wantBills)
			}
			for i := range bills {
				if bills[i] != tt.wantBills[i] {
					t.Errorf("bill payments = %v, want %v", bills, tt.wantBills)
					break
				}
			}
			if got := string(st.Settings["dailyBudgets"]); got != tt.wantFoodDays {
				t.Errorf("dailyBudgets = %s, want %s", got, tt.wantFoodDays)
			}
		})
	}
}
