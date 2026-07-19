.PHONY: build deploy test db

build:
	go build -o /home/exedev/srv ./cmd/srv

deploy:
	./deploy.sh

test:
	go test ./...

db:
	cd db && go tool sqlc generate
