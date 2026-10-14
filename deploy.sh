#!/bin/bash
# Deploy: pull latest, rebuild the PWA (dist/) and the Go server, restart it.
# Run from anywhere — locally it just SSHes in.
set -e

if [ "$(hostname)" != "budget-app" ]; then
  echo "==> Running deploy on the VM..."
  exec ssh exedev@budget-app.exe.xyz 'cd /home/exedev/budget-app && git pull --ff-only && ./deploy.sh'
fi

PATH="$HOME/.local/bin:/usr/local/go/bin:$PATH"  # node/npm and go; not set for non-interactive ssh
cd /home/exedev/budget-app

if ! grep -q '^BUDGET_MEMBERS=.\+' /home/exedev/budget.env 2>/dev/null; then
  echo "!! /home/exedev/budget.env must set BUDGET_MEMBERS=you@example.com,partner@example.com" >&2
  exit 1
fi

echo "==> Installing deps..."
npm ci --no-audit --no-fund
echo "==> Building PWA..."
npm run build
echo "==> Building server..."
go build -o /home/exedev/srv.new ./cmd/srv
mv /home/exedev/srv.new /home/exedev/srv

if ! cmp -s srv.service /etc/systemd/system/srv.service; then
  echo "==> Updating service file..."
  sudo cp srv.service /etc/systemd/system/srv.service
  sudo systemctl daemon-reload
fi
echo "==> Restarting..."
sudo systemctl restart srv
sleep 2
member=$(sed -n 's/^BUDGET_MEMBERS=\([^,]*\).*/\1/p' /home/exedev/budget.env)
code=$(curl -s -o /dev/null -w '%{http_code}' -H "X-ExeDev-Email: $member" http://localhost:8000/api/state)
if [ "$code" != 200 ]; then
  echo "!! Server check failed (HTTP $code). Logs: journalctl -u srv -n 50" >&2
  exit 1
fi
echo "==> ✅ Deployed — https://budget-app.exe.xyz/"
