package main

import (
	"flag"
	"fmt"
	"os"
	"strings"

	"srv.exe.dev/srv"
)

var (
	flagListenAddr = flag.String("listen", ":8000", "address to listen on")
	flagDB         = flag.String("db", "db.sqlite3", "path to the sqlite database")
	flagDist       = flag.String("dist", "dist", "directory holding the built PWA")
	flagDevUser    = flag.String("dev-user", "", "local development only: treat requests with no exe.dev login as this email")
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	flag.Parse()
	// BUDGET_MEMBERS: comma-separated emails who share the budget. Kept out of
	// the repo; on the VM it lives in the service's environment file.
	members := strings.Split(os.Getenv("BUDGET_MEMBERS"), ",")
	server, err := srv.New(*flagDB, *flagDist, members, *flagDevUser)
	if err != nil {
		return fmt.Errorf("create server: %w", err)
	}
	return server.Serve(*flagListenAddr)
}
