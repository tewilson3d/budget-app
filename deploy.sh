#!/bin/bash
set -e
cd /home/exedev/budget-app
echo "==> Building..."
go build -o /home/exedev/srv ./cmd/srv
echo "==> Restarting service..."
sudo systemctl restart srv
sleep 1
if systemctl is-active --quiet srv; then
  echo "==> ✅ Deployed successfully!"
  echo "    https://budget-app.exe.xyz/"
else
  echo "==> ❌ Service failed to start"
  journalctl -u srv --no-pager -n 10
  exit 1
fi
