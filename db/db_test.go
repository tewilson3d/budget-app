package db

import (
	"context"
	"path/filepath"
	"testing"
)

// Every pooled connection must carry the pragmas, not just the first one.
func TestOpen_pragmasOnEveryConnection(t *testing.T) {
	t.Parallel()
	d, err := Open(filepath.Join(t.TempDir(), "t.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()
	for i := range 3 {
		conn, err := d.Conn(ctx) // held open, so each loop gets a new connection
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		var timeout, fk int
		var mode string
		if err := conn.QueryRowContext(ctx, "PRAGMA busy_timeout").Scan(&timeout); err != nil {
			t.Fatal(err)
		}
		if err := conn.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&fk); err != nil {
			t.Fatal(err)
		}
		if err := conn.QueryRowContext(ctx, "PRAGMA journal_mode").Scan(&mode); err != nil {
			t.Fatal(err)
		}
		if timeout != 5000 || fk != 1 || mode != "wal" {
			t.Errorf("connection %d: busy_timeout=%d foreign_keys=%d journal_mode=%s", i, timeout, fk, mode)
		}
	}
}
