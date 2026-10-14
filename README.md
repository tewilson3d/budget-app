# Budget Tracker

A shared daily spending tracker: a React PWA (`src/`) backed by a small Go
server (`srv/`) on exe.dev. Everyone listed in `BUDGET_MEMBERS` logs in with
exe.dev and works on the same budget ("one pot"): entries, bills, budgets and
the wallet balance are shared.

## How data moves

- Each phone keeps a copy in localStorage, so the app is instant and works
  offline. Every change is also queued (`src/outbox.ts`) and sent to the server
  once it is reachable.
- `src/sync.ts` sends queued changes, then takes the server's copy: on open,
  when the app returns to the foreground, and every 30 seconds.
- The first time a phone runs the shared version it uploads the history it
  already has (merge only: nothing on the server is overwritten). Until that
  succeeds the phone never pulls, so no phone can lose history only it holds.
- The server stores each entry, bill payment and the settings as the PWA's JSON
  (`db/migrations/003-shared.sql`). Restoring a backup in Settings replaces the
  shared budget for everyone.

## Access

The site is private on exe.dev and shared with each member
(`ssh exe.dev share add budget-app <email>`). The server also checks
`X-ExeDev-Email` against `BUDGET_MEMBERS` and refuses anyone else.

On the VM, `/home/exedev/budget.env` holds:

```
BUDGET_MEMBERS=you@example.com,partner@example.com
```

## Building and running

- Deploy: `./deploy.sh` (from anywhere; it SSHes in, pulls, builds, restarts).
- Tests: `go test ./...`
- Local: `npm run build`, then
  `BUDGET_MEMBERS=you@example.com go run ./cmd/srv -dev-user you@example.com`
  and open http://localhost:8000. Or run `npm run dev` alongside the Go server;
  Vite proxies `/api` to it. `-dev-user` stands in for the exe.dev login and must
  never be used on the VM.
- Logs on the VM: `journalctl -u srv -f`

## Database

SQLite at `/home/exedev/budget.sqlite3`. Queries are managed with sqlc:
edit `db/queries/`, then `make db`.

## Code layout

- `src/`: the PWA (React + Vite + vite-plugin-pwa)
- `cmd/srv`: server entrypoint and flags
- `srv`: HTTP handlers (`server.go`: login check, static files; `api.go`: shared budget API)
- `db`: SQLite open + migrations, sqlc queries and generated code
