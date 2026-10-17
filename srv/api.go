package srv

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"srv.exe.dev/db/dbgen"
)

// Request size caps. A year of entries is well under 1 MB; imports carry a
// phone's whole history.
const (
	maxDocBytes    = 256 << 10
	maxImportBytes = 16 << 20
)

// The server checks only the fields it addresses rows by and that the totals
// depend on; the rest of each document is the PWA's and is stored as sent.

var validCategories = map[string]bool{
	"food": true, "groceries": true, "dogs": true,
	"automotive": true, "household": true, "supplements": true, "miscellaneous": true,
}

// exactFields decodes the named fields of a JSON object by their exact key.
// encoding/json matches struct fields case-insensitively, which would accept
// {"ID": ...} although the PWA reads e.id. A missing key is left unset.
func exactFields(raw json.RawMessage, fields map[string]any) error {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil || obj == nil {
		return fmt.Errorf("not a JSON object")
	}
	for key, dst := range fields {
		if v, ok := obj[key]; ok {
			if err := json.Unmarshal(v, dst); err != nil {
				return fmt.Errorf("%s has the wrong type", key)
			}
		}
	}
	return nil
}

type entryKeys struct {
	ID       string
	Date     string
	Category string
	Amount   *float64
}

func checkEntry(raw json.RawMessage) (entryKeys, error) {
	var e entryKeys
	if err := exactFields(raw, map[string]any{"id": &e.ID, "date": &e.Date, "category": &e.Category, "amount": &e.Amount}); err != nil {
		return e, fmt.Errorf("entry: %w", err)
	}
	switch {
	case e.ID == "" || len(e.ID) > 100:
		return e, fmt.Errorf("entry id is missing or too long")
	case !isDate(e.Date):
		return e, fmt.Errorf("entry %s: date must be YYYY-MM-DD", e.ID)
	case !validCategories[e.Category]:
		return e, fmt.Errorf("entry %s: unknown category %q", e.ID, e.Category)
	case e.Amount == nil || *e.Amount <= 0:
		return e, fmt.Errorf("entry %s: amount must be positive", e.ID)
	}
	return e, nil
}

type paymentKeys struct {
	BillID string
	Month  string
	Amount *float64
}

func checkPayment(raw json.RawMessage) (paymentKeys, error) {
	var p paymentKeys
	if err := exactFields(raw, map[string]any{"billId": &p.BillID, "month": &p.Month, "amount": &p.Amount}); err != nil {
		return p, fmt.Errorf("bill payment: %w", err)
	}
	switch {
	case p.BillID == "" || len(p.BillID) > 100:
		return p, fmt.Errorf("bill payment billId is missing or too long")
	case !isMonth(p.Month):
		return p, fmt.Errorf("bill payment %s: month must be YYYY-MM", p.BillID)
	case p.Amount == nil || *p.Amount < 0:
		return p, fmt.Errorf("bill payment %s: amount must not be negative", p.BillID)
	}
	return p, nil
}

func checkSettings(raw json.RawMessage) error {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil || obj == nil {
		return fmt.Errorf("settings must be a JSON object")
	}
	return nil
}

func isDate(s string) bool {
	_, err := time.Parse("2006-01-02", s)
	return err == nil && len(s) == 10
}

func isMonth(s string) bool {
	_, err := time.Parse("2006-01", s)
	return err == nil && len(s) == 7
}

// readJSON decodes a size-capped body. It writes the error response itself.
func readJSON(w http.ResponseWriter, r *http.Request, limit int64, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit)).Decode(v); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

func rawList(rows []string) []json.RawMessage {
	out := make([]json.RawMessage, 0, len(rows))
	for _, row := range rows {
		out = append(out, json.RawMessage(row))
	}
	return out
}

// ---- State ----

// HandleState handles GET /api/state: everything the PWA keeps, in one go.
// settings is null until someone saves or imports some.
func (s *Server) HandleState(w http.ResponseWriter, r *http.Request) {
	q := dbgen.New(s.DB)
	entries, err := q.ListEntries(r.Context())
	if err != nil {
		slog.Error("list entries", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to load entries")
		return
	}
	payments, err := q.ListBillPayments(r.Context())
	if err != nil {
		slog.Error("list bill payments", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to load bill payments")
		return
	}
	var settings json.RawMessage
	switch data, err := q.GetSettings(r.Context()); {
	case err == nil:
		settings = json.RawMessage(data)
	case errors.Is(err, sql.ErrNoRows):
		settings = json.RawMessage("null")
	default:
		slog.Error("get settings", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to load settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"member":       member(r),
		"entries":      rawList(entries),
		"billPayments": rawList(payments),
		"settings":     settings,
	})
}

// ---- Entries ----

// HandlePutEntry handles PUT /api/entries/{id}. Saving the same entry twice is
// harmless, so a phone can safely retry after a dropped connection.
func (s *Server) HandlePutEntry(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if !readJSON(w, r, maxDocBytes, &raw) {
		return
	}
	e, err := checkEntry(raw)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if e.ID != r.PathValue("id") {
		writeJSONError(w, http.StatusBadRequest, "entry id does not match the URL")
		return
	}
	if err := dbgen.New(s.DB).UpsertEntry(r.Context(), dbgen.UpsertEntryParams{
		ID: e.ID, Date: e.Date, Data: string(raw), CreatedBy: member(r), UpdatedAt: time.Now(),
	}); err != nil {
		slog.Error("upsert entry", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to save entry")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"saved": true})
}

// HandleDeleteEntry handles DELETE /api/entries/{id}. Deleting an entry that is
// already gone succeeds, for the same retry reason.
func (s *Server) HandleDeleteEntry(w http.ResponseWriter, r *http.Request) {
	if _, err := dbgen.New(s.DB).DeleteEntry(r.Context(), r.PathValue("id")); err != nil {
		slog.Error("delete entry", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to delete entry")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// ---- Bill payments ----

// HandlePutPayment handles PUT /api/payments/{billID}/{month}: marks a bill paid.
func (s *Server) HandlePutPayment(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if !readJSON(w, r, maxDocBytes, &raw) {
		return
	}
	p, err := checkPayment(raw)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if p.BillID != r.PathValue("billID") || p.Month != r.PathValue("month") {
		writeJSONError(w, http.StatusBadRequest, "bill payment does not match the URL")
		return
	}
	if err := dbgen.New(s.DB).UpsertBillPayment(r.Context(), dbgen.UpsertBillPaymentParams{
		BillID: p.BillID, Month: p.Month, Data: string(raw), CreatedBy: member(r), UpdatedAt: time.Now(),
	}); err != nil {
		slog.Error("upsert bill payment", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to save bill payment")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"saved": true})
}

// HandleDeletePayment handles DELETE /api/payments/{billID}/{month}: marks a bill unpaid.
func (s *Server) HandleDeletePayment(w http.ResponseWriter, r *http.Request) {
	if _, err := dbgen.New(s.DB).DeleteBillPayment(r.Context(), dbgen.DeleteBillPaymentParams{
		BillID: r.PathValue("billID"), Month: r.PathValue("month"),
	}); err != nil {
		slog.Error("delete bill payment", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to delete bill payment")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// ---- Settings ----

// HandlePutSettings handles PUT /api/settings. The whole settings document is
// replaced; the last member to save wins.
func (s *Server) HandlePutSettings(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if !readJSON(w, r, maxDocBytes, &raw) {
		return
	}
	if err := checkSettings(raw); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := dbgen.New(s.DB).UpsertSettings(r.Context(), dbgen.UpsertSettingsParams{
		Data: string(raw), UpdatedBy: member(r), UpdatedAt: time.Now(),
	}); err != nil {
		slog.Error("upsert settings", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to save settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"saved": true})
}

// ---- Import ----

type importRequest struct {
	// Mode "merge" adds what the pot lacks and keeps what it has: a phone's
	// pre-sharing history, sent once. Mode "upsert" uploads a phone's complete
	// current copy without deleting server-only records. Mode "replace" makes
	// entries and bill payments exactly the backup's: restoring a backup file.
	Mode         string            `json:"mode"`
	Entries      []json.RawMessage `json:"entries"`
	BillPayments []json.RawMessage `json:"billPayments"`
	Settings     json.RawMessage   `json:"settings"`
}

// HandleImport handles POST /api/import. It is all-or-nothing: one bad
// document rejects the whole import.
func (s *Server) HandleImport(w http.ResponseWriter, r *http.Request) {
	var req importRequest
	if !readJSON(w, r, maxImportBytes, &req) {
		return
	}
	if req.Mode != "merge" && req.Mode != "upsert" && req.Mode != "replace" {
		writeJSONError(w, http.StatusBadRequest, `mode must be "merge", "upsert", or "replace"`)
		return
	}
	entries := make([]entryKeys, len(req.Entries))
	for i, raw := range req.Entries {
		e, err := checkEntry(raw)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		entries[i] = e
	}
	payments := make([]paymentKeys, len(req.BillPayments))
	for i, raw := range req.BillPayments {
		p, err := checkPayment(raw)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		payments[i] = p
	}
	hasSettings := len(req.Settings) > 0 && string(req.Settings) != "null"
	if hasSettings {
		if err := checkSettings(req.Settings); err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	if err := s.importTx(r.Context(), member(r), req, entries, payments, hasSettings); err != nil {
		slog.Error("import", "mode", req.Mode, "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to import")
		return
	}
	slog.Info("import", "mode", req.Mode, "member", member(r), "entries", len(entries), "bill_payments", len(payments))
	writeJSON(w, http.StatusOK, map[string]any{"imported": true, "entries": len(entries)})
}

func (s *Server) importTx(ctx context.Context, by string, req importRequest, entries []entryKeys, payments []paymentKeys, hasSettings bool) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	q := dbgen.New(tx)
	now := time.Now()
	replace := req.Mode == "replace"
	upsert := replace || req.Mode == "upsert"

	if replace {
		if err := q.DeleteAllEntries(ctx); err != nil {
			return err
		}
		if err := q.DeleteAllBillPayments(ctx); err != nil {
			return err
		}
	}
	for i, e := range entries {
		p := dbgen.InsertEntryIfMissingParams{ID: e.ID, Date: e.Date, Data: string(req.Entries[i]), CreatedBy: by, UpdatedAt: now}
		if upsert {
			err = q.UpsertEntry(ctx, dbgen.UpsertEntryParams(p))
		} else {
			err = q.InsertEntryIfMissing(ctx, p)
		}
		if err != nil {
			return fmt.Errorf("entry %s: %w", e.ID, err)
		}
	}
	for i, pk := range payments {
		p := dbgen.InsertBillPaymentIfMissingParams{BillID: pk.BillID, Month: pk.Month, Data: string(req.BillPayments[i]), CreatedBy: by, UpdatedAt: now}
		if upsert {
			err = q.UpsertBillPayment(ctx, dbgen.UpsertBillPaymentParams(p))
		} else {
			err = q.InsertBillPaymentIfMissing(ctx, p)
		}
		if err != nil {
			return fmt.Errorf("bill payment %s/%s: %w", pk.BillID, pk.Month, err)
		}
	}
	if hasSettings {
		if upsert {
			err = q.UpsertSettings(ctx, dbgen.UpsertSettingsParams{Data: string(req.Settings), UpdatedBy: by, UpdatedAt: now})
		} else {
			err = q.InsertSettingsIfMissing(ctx, dbgen.InsertSettingsIfMissingParams{Data: string(req.Settings), UpdatedBy: by, UpdatedAt: now})
		}
		if err != nil {
			return fmt.Errorf("settings: %w", err)
		}
	}
	return tx.Commit()
}
