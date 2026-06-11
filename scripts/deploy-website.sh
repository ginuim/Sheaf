#!/usr/bin/env bash

set -euo pipefail

REMOTE_HOST="root@47.82.162.221"
REMOTE_PATH="/var/www/html/sheaf"

# 直连部署：禁用 ControlMaster，避免复用坏套接字时出现「banner exchange: invalid format」；
# 超时与保活减轻 NAT/间歇网络导致的半开连接。
DEPLOY_SSH_EXTRA="-o ConnectTimeout=25 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -o ControlMaster=no -o ControlPath=none"
RSYNC_SSH="ssh ${DEPLOY_SSH_EXTRA}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${PROJECT_ROOT}/dist"
STAGE_DIR="${DIST_DIR}/.website-deploy"

cd "${PROJECT_ROOT}"

echo "构建 landing page ..."
pnpm build:website

if [[ ! -f "${DIST_DIR}/website.html" ]]; then
  echo "部署失败：未找到 ${DIST_DIR}/website.html，请先确认构建成功"
  exit 1
fi

if [[ ! -d "${DIST_DIR}/assets" ]]; then
  echo "部署失败：未找到 ${DIST_DIR}/assets 目录"
  exit 1
fi

echo "组装部署目录（website.html 与 assets/ 同级）..."
rm -rf "${STAGE_DIR}"
mkdir -p "${STAGE_DIR}/assets"
cp "${DIST_DIR}/website.html" "${STAGE_DIR}/website.html"
cp -r "${DIST_DIR}/assets/." "${STAGE_DIR}/assets/"
if [[ -f "${DIST_DIR}/vite.svg" ]]; then
  cp "${DIST_DIR}/vite.svg" "${STAGE_DIR}/"
fi

echo "部署到 ${REMOTE_HOST}:${REMOTE_PATH}/ ..."
ssh ${DEPLOY_SSH_EXTRA} "${REMOTE_HOST}" "mkdir -p '${REMOTE_PATH}'"
rsync -az --delete -e "${RSYNC_SSH}" "${STAGE_DIR}/" "${REMOTE_HOST}:${REMOTE_PATH}/"

echo "部署完成：https://sheaf.reaidea.com/"
echo "Nginx 需设置：root ${REMOTE_PATH}; index website.html;"
