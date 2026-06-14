#!/usr/bin/env bash
#
# Operate the pugloo preview gateway VM. The kill switch for abuse or cost
# incidents on an open/public gateway.
#
#   ./scripts/gateway-ops.sh status            # is the VM running?
#   ./scripts/gateway-ops.sh disable           # stop accepting/serving tunnels (keep VM + notice page)
#   ./scripts/gateway-ops.sh enable            # resume tunnels
#   ./scripts/gateway-ops.sh stop              # hard kill: power off the VM (all previews go dark)
#   ./scripts/gateway-ops.sh start             # power the VM back on
#   ./scripts/gateway-ops.sh logs              # tail frps + caddy logs
#   ./scripts/gateway-ops.sh kill <subdomain>  # drop one abusive tunnel now
#
set -euo pipefail

PROJECT="${PROJECT:-ani-hq}"
ZONE="${ZONE:-us-central1-a}"
NAME="${NAME:-pugloo-gateway}"
cmd="${1:-status}"

ssh() { gcloud compute ssh "$NAME" --project "$PROJECT" --zone "$ZONE" --command "$1"; }

case "$cmd" in
  status) gcloud compute instances describe "$NAME" --project "$PROJECT" --zone "$ZONE" --format='value(status)' ;;
  disable) ssh 'sudo systemctl stop frps' && echo "frps stopped — tunnels offline, VM + notice page still up" ;;
  enable)  ssh 'sudo systemctl start frps' && echo "frps started" ;;
  stop)    gcloud compute instances stop "$NAME" --project "$PROJECT" --zone "$ZONE" && echo "VM powered off — everything offline" ;;
  start)   gcloud compute instances start "$NAME" --project "$PROJECT" --zone "$ZONE" ;;
  logs)    ssh 'sudo journalctl -u frps -u caddy --no-pager -n 80' ;;
  kill)
    sub="${2:?usage: gateway-ops.sh kill <subdomain>}"
    # frps reloads its routing when a client disconnects; the fastest reliable
    # takedown is to restart frps (drops all tunnels) — for a single tunnel,
    # prefer asking the user to stop, or restart if it is actively abusive.
    echo "Dropping all tunnels to remove '$sub' (frps has no per-tunnel kill API)."
    ssh 'sudo systemctl restart frps' && echo "frps restarted; clients must reconnect" ;;
  *) echo "usage: $0 {status|disable|enable|stop|start|logs|kill <subdomain>}"; exit 2 ;;
esac
