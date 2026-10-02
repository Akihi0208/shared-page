#!/usr/bin/env bash
set -euo pipefail

HTTPS_PORT="${WUDENG_HTTPS_PORT:-8443}"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "这台机器还没有 Tailscale，先安装并登录后再运行。" >&2
  exit 1
fi

calendar_token="$(sudo sed -n 's/^CALENDAR_TOKEN=//p' /etc/wudeng-handbook/wudeng.env)"
if ! curl --fail --silent --show-error http://127.0.0.1:8791/api/v1/calendar/ping \
  -H "X-Calendar-Token: ${calendar_token}" \
  >/dev/null; then
  echo "雾灯手帐本机服务还没有正常响应，请先检查 systemctl status wudeng-web。" >&2
  exit 1
fi

# Use a dedicated HTTPS port.  This deliberately leaves any existing :443
# Serve/Funnel/Caddy/nginx configuration untouched.
sudo tailscale serve --bg --https="${HTTPS_PORT}" http://127.0.0.1:8791

dns_name="$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
echo
echo "手机连着 Tailscale 时打开："
echo "https://${dns_name}:${HTTPS_PORT}/"
