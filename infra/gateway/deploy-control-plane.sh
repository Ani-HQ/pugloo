#!/usr/bin/env bash
#
# Deploy/update the control-plane (accounts/quotas frp plugin) on the gateway VM.
# Zero npm deps — installs Node 22 (for node:sqlite) and copies the JS files.
#
#   PROJECT=my-gcp-project ./deploy-control-plane.sh
#
# Prints the admin secret used to mint tokens; save it. Re-running updates the
# code and restarts the service (DB at /var/lib/pugloo is preserved).
set -euo pipefail

PROJECT="${PROJECT:?set PROJECT}"
ZONE="${ZONE:-us-central1-a}"
NAME="${NAME:-pugloo-gateway}"
ADMIN_SECRET="${CONTROL_PLANE_ADMIN_SECRET:-$(openssl rand -hex 24)}"

here="$(cd "$(dirname "$0")" && pwd)"
CP="$here/../../services/control-plane"

echo "==> copy control-plane files"
gcloud compute scp "$CP/decisions.js" "$CP/db.js" "$CP/server.js" "$CP/package.json" \
  "$NAME:/tmp/" --project "$PROJECT" --zone "$ZONE"

echo "==> install node + service"
gcloud compute ssh "$NAME" --project "$PROJECT" --zone "$ZONE" --command "
set -e
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null 2>&1
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >/dev/null 2>&1
fi
sudo mkdir -p /opt/pugloo-cp /var/lib/pugloo
sudo mv /tmp/decisions.js /tmp/db.js /tmp/server.js /tmp/package.json /opt/pugloo-cp/
sudo tee /etc/systemd/system/pugloo-cp.service >/dev/null <<UNIT
[Unit]
Description=pugloo control plane (frp plugin)
After=network.target
[Service]
WorkingDirectory=/opt/pugloo-cp
ExecStart=/usr/bin/node --no-warnings /opt/pugloo-cp/server.js
Environment=PORT=8090
Environment=CONTROL_PLANE_DB=/var/lib/pugloo/control-plane.db
Environment=CONTROL_PLANE_ADMIN_SECRET=$ADMIN_SECRET
Environment=GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID:-}
Environment=GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET:-}
Environment=CONTROL_PLANE_PUBLIC_URL=${CONTROL_PLANE_PUBLIC_URL:-}
Restart=always
RestartSec=2
User=root
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable pugloo-cp >/dev/null 2>&1
sudo systemctl restart pugloo-cp
sleep 2
sudo systemctl is-active pugloo-cp
curl -fsS http://127.0.0.1:8090/health && echo
"

cat <<EOF

==> control-plane deployed. Admin secret (save it — mints account tokens):
  $ADMIN_SECRET

Mint a token:
  gcloud compute ssh $NAME --project $PROJECT --zone $ZONE --command \\
    "curl -fsS -X POST http://127.0.0.1:8090/tokens -H 'Authorization: Bearer $ADMIN_SECRET' -d '{\"name\":\"me\",\"tier\":\"free\"}'"

Then on the client: pugloo login --token pgl_...
Make sure frps.toml has the [[httpPlugins]] block (see frps.toml.tmpl) and no shared auth.token.
EOF
