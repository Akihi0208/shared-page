#!/usr/bin/env bash
set -euo pipefail

APP_NAME="wudeng-handbook"
APP_USER="wudeng"
APP_DIR="/opt/wudeng-handbook"
CONFIG_DIR="/etc/wudeng-handbook"
ENV_FILE="${CONFIG_DIR}/wudeng.env"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 sudo 运行：sudo ./deploy/install.sh" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "没有找到 python3，请先安装 Python 3.10 或更高版本。" >&2
  exit 1
fi

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

install -d -m 0755 "${APP_DIR}" "${APP_DIR}/server"
install -d -m 0750 -o "${APP_USER}" -g "${APP_USER}" "${APP_DIR}/data"
install -d -m 0750 "${CONFIG_DIR}"

# Copy application code without touching the persistent data directory.
cp -a "${REPO_DIR}/server/." "${APP_DIR}/server/"
rm -rf "${APP_DIR}/server/data" "${APP_DIR}/server/.venv" "${APP_DIR}/server/__pycache__"

python3 -m venv "${APP_DIR}/.venv"
"${APP_DIR}/.venv/bin/python" -m pip install --upgrade pip
"${APP_DIR}/.venv/bin/python" -m pip install -r "${APP_DIR}/server/requirements.txt"

if [[ ! -f "${ENV_FILE}" ]]; then
  token="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
  cat >"${ENV_FILE}" <<EOF
CALENDAR_TOKEN=${token}
CALENDAR_DB=${APP_DIR}/data/calendar.db
CALENDAR_PAGES_DIR=${APP_DIR}/data/pages
CALENDAR_TZ=Asia/Shanghai
CALENDAR_USER_NAME=惠惠
CALENDAR_ASSISTANT_NAME=沈雾
MCP_HOST=127.0.0.1
MCP_PORT=8792
EOF
  chmod 0600 "${ENV_FILE}"
fi

install -m 0644 "${SCRIPT_DIR}/wudeng-web.service" /etc/systemd/system/wudeng-web.service
install -m 0644 "${SCRIPT_DIR}/wudeng-mcp.service" /etc/systemd/system/wudeng-mcp.service
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

systemctl daemon-reload
systemctl enable --now wudeng-web.service wudeng-mcp.service

echo
echo "雾灯手帐已经在本机启动："
echo "  网页  http://127.0.0.1:8791"
echo "  MCP   http://127.0.0.1:8792/mcp"
echo "  配置  ${ENV_FILE}"
echo
echo "接下来可运行 ./deploy/publish-private.sh，生成手机能打开的 HTTPS 地址。"
