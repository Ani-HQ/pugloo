#!/usr/bin/env bash
#
# Deploy/update the control-plane (accounts/quotas frp plugin) on the gateway VM.
# Zero npm deps — installs Node 22 (for node:sqlite) and copies the JS files.
#
#   PROJECT=my-gcp-project ./deploy-control-plane.sh
#
# Idempotent: re-running updates the code and restarts the service. The DB at
# /var/lib/pugloo and existing secrets in /etc/pugloo-cp.env are preserved —
# CONTROL_PLANE_ADMIN_SECRET / GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET /
# CONTROL_PLANE_PUBLIC_URL env vars override, otherwise the values already on
# the VM are kept. An admin secret is generated only if none exists anywhere.
set -euo pipefail

PROJECT="${PROJECT:?set PROJECT}"
ZONE="${ZONE:-us-central1-a}"
NAME="${NAME:-pugloo-gateway}"

here="$(cd "$(dirname "$0")" && pwd)"
CP="$here/../../services/control-plane"

echo "==> copy control-plane files"
gcloud compute scp "$CP/decisions.js" "$CP/db.js" "$CP/server.js" "$CP/github.js" "$CP/package.json" \
  "$NAME:/tmp/" --project "$PROJECT" --zone "$ZONE"

echo "==> install node + service"
# Overrides travel via a temp env file (0600), never on a command line where
# they would land in shell history and GCP audit logs.
OVERRIDES="$(mktemp)"
chmod 0600 "$OVERRIDES"
{
  [ -n "${CONTROL_PLANE_ADMIN_SECRET:-}" ] && echo "CONTROL_PLANE_ADMIN_SECRET=$CONTROL_PLANE_ADMIN_SECRET"
  [ -n "${GITHUB_CLIENT_ID:-}" ] && echo "GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID"
  [ -n "${GITHUB_CLIENT_SECRET:-}" ] && echo "GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET"
  [ -n "${CONTROL_PLANE_PUBLIC_URL:-}" ] && echo "CONTROL_PLANE_PUBLIC_URL=$CONTROL_PLANE_PUBLIC_URL"
} > "$OVERRIDES" || true
gcloud compute scp "$OVERRIDES" "$NAME:/tmp/pugloo-cp-overrides.env" --project "$PROJECT" --zone "$ZONE"
rm -f "$OVERRIDES"

gcloud compute ssh "$NAME" --project "$PROJECT" --zone "$ZONE" --command '
set -e
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null 2>&1
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >/dev/null 2>&1
fi
sudo mkdir -p /opt/pugloo-cp /var/lib/pugloo
sudo mv /tmp/decisions.js /tmp/db.js /tmp/server.js /tmp/github.js /tmp/package.json /opt/pugloo-cp/

# Merge env: override file > existing /etc/pugloo-cp.env > legacy unit Environment= lines.
sudo touch /etc/pugloo-cp.env
sudo chmod 0600 /etc/pugloo-cp.env
merge_var() {
  key="$1"
  val="$(grep -s "^$key=" /tmp/pugloo-cp-overrides.env | head -1 | cut -d= -f2- || true)"
  [ -n "$val" ] || val="$(sudo grep -s "^$key=" /etc/pugloo-cp.env | head -1 | cut -d= -f2- || true)"
  [ -n "$val" ] || val="$(sudo grep -so "^Environment=$key=.*" /etc/systemd/system/pugloo-cp.service | head -1 | cut -d= -f3- || true)"
  echo "$val"
}
ADMIN="$(merge_var CONTROL_PLANE_ADMIN_SECRET)"
NEW_ADMIN=0
if [ -z "$ADMIN" ]; then ADMIN="$(openssl rand -hex 24)"; NEW_ADMIN=1; fi
GH_ID="$(merge_var GITHUB_CLIENT_ID)"
GH_SECRET="$(merge_var GITHUB_CLIENT_SECRET)"
PUB_URL="$(merge_var CONTROL_PLANE_PUBLIC_URL)"
sudo tee /etc/pugloo-cp.env >/dev/null <<ENV
PORT=8090
CONTROL_PLANE_DB=/var/lib/pugloo/control-plane.db
CONTROL_PLANE_ADMIN_SECRET=$ADMIN
GITHUB_CLIENT_ID=$GH_ID
GITHUB_CLIENT_SECRET=$GH_SECRET
CONTROL_PLANE_PUBLIC_URL=$PUB_URL
ENV
sudo chmod 0600 /etc/pugloo-cp.env
rm -f /tmp/pugloo-cp-overrides.env

sudo tee /etc/systemd/system/pugloo-cp.service >/dev/null <<UNIT
[Unit]
Description=pugloo control plane (frp plugin)
After=network.target
[Service]
WorkingDirectory=/opt/pugloo-cp
ExecStart=/usr/bin/node --no-warnings /opt/pugloo-cp/server.js
EnvironmentFile=/etc/pugloo-cp.env
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
if [ "$NEW_ADMIN" = 1 ]; then
  echo "NOTE: generated a NEW admin secret (none existed). Read it with:"
  echo "  sudo grep CONTROL_PLANE_ADMIN_SECRET /etc/pugloo-cp.env"
fi
'

cat <<EOF

==> control-plane deployed. Secrets live in /etc/pugloo-cp.env on the VM (0600).

Mint a token (run ON the VM so the secret never touches your shell history):
  gcloud compute ssh $NAME --project $PROJECT --zone $ZONE
  sudo bash -c 'set -a; . /etc/pugloo-cp.env; curl -fsS -X POST http://127.0.0.1:8090/tokens \\
    -H "Authorization: Bearer \$CONTROL_PLANE_ADMIN_SECRET" -d "{\"name\":\"me\",\"tier\":\"free\"}"'

Then on the client: pugloo login --token pgl_...
Make sure frps.toml has the [[httpPlugins]] block (see frps.toml.tmpl) and no shared auth.token.
EOF
