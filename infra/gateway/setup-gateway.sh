#!/usr/bin/env bash
#
# Provision the pugloo preview gateway: a small GCE VM running frps + Caddy.
# Idempotent — re-running reuses the existing static IP / firewall / VM.
#
#   PROJECT=ani-hq REGION=us-central1 ZONE=us-central1-a ./setup-gateway.sh
#
set -euo pipefail

PROJECT="${PROJECT:?set PROJECT}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-${REGION}-a}"
EMAIL="${EMAIL:-admin@example.com}"
MACHINE="${MACHINE:-e2-micro}"
NAME="${NAME:-pugloo-gateway}"
FRP_VERSION="${FRP_VERSION:-0.61.1}"

here="$(cd "$(dirname "$0")" && pwd)"

echo "==> static IP"
gcloud compute addresses create "${NAME}-ip" --project "$PROJECT" --region "$REGION" 2>/dev/null \
  || echo "    (exists)"
IP="$(gcloud compute addresses describe "${NAME}-ip" --project "$PROJECT" --region "$REGION" --format='value(address)')"
echo "    IP=$IP"

echo "==> firewall (7000/80/443)"
gcloud compute firewall-rules create "${NAME}-fw" --project "$PROJECT" \
  --allow tcp:7000,tcp:80,tcp:443 --target-tags "$NAME" \
  --description "pugloo preview gateway" 2>/dev/null || echo "    (exists)"

# Generate a token unless one is provided.
TOKEN="${PUGLOO_FRP_TOKEN:-$(openssl rand -hex 24)}"

# Render the startup script from the templates in this directory.
FRPS_TMPL="$(sed -e "s/__IP__/$IP/g" -e "s/__TOKEN__/$TOKEN/g" "$here/frps.toml.tmpl")"
CADDY_TMPL="$(sed -e "s/__IP__/$IP/g" -e "s/__EMAIL__/$EMAIL/g" "$here/Caddyfile.tmpl")"

STARTUP="$(mktemp)"
cat > "$STARTUP" <<STARTUP_EOF
#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy
cd /tmp
curl -fsSL -o frp.tar.gz "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_amd64.tar.gz"
tar xzf frp.tar.gz
install -m 0755 "frp_${FRP_VERSION}_linux_amd64/frps" /usr/local/bin/frps
mkdir -p /etc/frp
cat > /etc/frp/frps.toml <<'FRPS'
${FRPS_TMPL}
FRPS
cat > /etc/caddy/Caddyfile <<'CADDY'
${CADDY_TMPL}
CADDY
cat > /etc/systemd/system/frps.service <<'UNIT'
[Unit]
Description=frp server
After=network.target
[Service]
ExecStart=/usr/local/bin/frps -c /etc/frp/frps.toml
Restart=always
RestartSec=2
User=root
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable frps
systemctl restart frps
systemctl restart caddy
echo ready > /var/log/pugloo-startup-done
STARTUP_EOF

echo "==> VM ($MACHINE, $ZONE)"
if gcloud compute instances describe "$NAME" --project "$PROJECT" --zone "$ZONE" >/dev/null 2>&1; then
  echo "    (exists) updating startup-script + resetting"
  gcloud compute instances add-metadata "$NAME" --project "$PROJECT" --zone "$ZONE" \
    --metadata-from-file startup-script="$STARTUP" >/dev/null
  gcloud compute instances reset "$NAME" --project "$PROJECT" --zone "$ZONE" >/dev/null
else
  gcloud compute instances create "$NAME" --project "$PROJECT" --zone "$ZONE" \
    --machine-type "$MACHINE" \
    --image-family debian-12 --image-project debian-cloud \
    --address "${NAME}-ip" --tags "$NAME" \
    --metadata-from-file startup-script="$STARTUP" >/dev/null
fi
rm -f "$STARTUP"

cat <<EOF

==> done. Add to ~/.pugloo/preview.env (keep the token secret, do not commit):

  export PUGLOO_FRP_SERVER=$IP
  export PUGLOO_FRP_PORT=7000
  export PUGLOO_FRP_DOMAIN=$IP.sslip.io
  export PUGLOO_FRP_TOKEN=$TOKEN
  export PUGLOO_FRP_BIN=\$(command -v frpc)

Then: source ~/.pugloo/preview.env && pugloo preview --json
(give the VM ~90s on first boot to install frps + Caddy)
EOF
