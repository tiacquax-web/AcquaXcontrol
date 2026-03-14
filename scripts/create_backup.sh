#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${ROOT_DIR}/backups"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
TARGET_DIR="${BACKUP_ROOT}/acquaxcontrol-${TIMESTAMP}"

mkdir -p "${TARGET_DIR}"

echo "[1/6] Creating Git bundle (full history)..."
git -C "${ROOT_DIR}" bundle create "${TARGET_DIR}/repository-full.bundle" --all

echo "[2/6] Exporting repository snapshot (HEAD)..."
git -C "${ROOT_DIR}" archive --format=tar.gz --output="${TARGET_DIR}/repository-head.tar.gz" HEAD

echo "[3/6] Saving repository metadata..."
{
  echo "timestamp=${TIMESTAMP}"
  echo "branch=$(git -C "${ROOT_DIR}" branch --show-current)"
  echo "head_commit=$(git -C "${ROOT_DIR}" rev-parse HEAD)"
  echo "remote_origin=$(git -C "${ROOT_DIR}" remote get-url origin)"
} > "${TARGET_DIR}/metadata.env"

git -C "${ROOT_DIR}" status --short > "${TARGET_DIR}/git-status.txt"
git -C "${ROOT_DIR}" log --oneline -30 > "${TARGET_DIR}/recent-commits.txt"

echo "[4/6] Generating checksums..."
(
  cd "${TARGET_DIR}"
  sha256sum repository-full.bundle repository-head.tar.gz metadata.env git-status.txt recent-commits.txt > SHA256SUMS.txt
)

echo "[5/6] Optional database backup check..."
if command -v mongodump >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
  echo "mongodump available and DATABASE_URL set. Creating database dump..."
  DB_DUMP_DIR="${TARGET_DIR}/database-dump"
  mkdir -p "${DB_DUMP_DIR}"
  mongodump --uri="${DATABASE_URL}" --out="${DB_DUMP_DIR}" >/dev/null
  (
    cd "${TARGET_DIR}"
    tar -czf database-dump.tar.gz database-dump
    rm -rf database-dump
    sha256sum database-dump.tar.gz >> SHA256SUMS.txt
  )
else
  echo "Skipping database dump (mongodump not available or DATABASE_URL not set)." \
    > "${TARGET_DIR}/database-dump-skipped.txt"
fi

echo "[6/6] Backup complete."
echo "Backup folder: ${TARGET_DIR}"
echo "Main artifacts:"
echo "  - repository-full.bundle"
echo "  - repository-head.tar.gz"
echo "  - metadata.env"
echo "  - SHA256SUMS.txt"
