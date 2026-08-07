#!/bin/bash
# Deploy the PWA: pull latest, rebuild dist/. busybox httpd serves dist/ live,
# so no service restart is needed. Run from anywhere — locally it just SSHes in.
set -e

if [ "$(hostname)" != "budget-app" ]; then
  echo "==> Running deploy on the VM..."
  exec ssh exedev@budget-app.exe.xyz 'cd /home/exedev/budget-app && git pull --ff-only && ./deploy.sh'
fi

cd /home/exedev/budget-app
echo "==> Installing deps..."
npm ci --no-audit --no-fund
echo "==> Building..."
npm run build
echo "==> ✅ Deployed — https://budget-app.exe.xyz/"
