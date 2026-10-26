#!/usr/bin/env bash
set -Eeuo pipefail

# Run from a dedicated Git checkout on the BaoTa server.
# Override SITE_ROOT if the site's document root differs from the default.
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SITE_ROOT="${SITE_ROOT:-/www/wwwroot/codehive.asia}"
BRANCH="master"
BACKUP_DIR="${BACKUP_DIR:-/www/backup/codehive.asia}"

for command in git node npm rsync flock realpath mktemp; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing command: $command" >&2; exit 1; }
done

[[ -d "$SITE_ROOT" ]] || { echo "Site root does not exist: $SITE_ROOT" >&2; exit 1; }
SITE_ROOT="$(realpath "$SITE_ROOT")"
BACKUP_DIR="$(realpath -m "$BACKUP_DIR")"
LOCK_FILE="${LOCK_FILE:-$BACKUP_DIR/.deploy.lock}"
[[ "$SITE_ROOT" == /www/wwwroot/* ]] || { echo "Site root must be under /www/wwwroot" >&2; exit 1; }
[[ "$BACKUP_DIR" != "$SITE_ROOT" && "$BACKUP_DIR" != "$SITE_ROOT"/* ]] || {
  echo "Backup directory must be outside the site root" >&2; exit 1;
}
[[ "$SOURCE_DIR" != "$SITE_ROOT" && "$SOURCE_DIR" != "$SITE_ROOT"/* ]] || {
  echo "The Git checkout must be outside the site root" >&2; exit 1;
}
[[ ! -e "$SITE_ROOT/.git" && ! -e "$SITE_ROOT/.env" && ! -d "$SITE_ROOT/backend" ]] || {
  echo "The site root contains source code or private configuration; refusing to publish" >&2; exit 1;
}
[[ "$(git -C "$SOURCE_DIR" rev-parse --show-toplevel)" == "$SOURCE_DIR" ]] || {
  echo "Script must run from the repository checkout" >&2; exit 1;
}
[[ "$(git -C "$SOURCE_DIR" branch --show-current)" == "$BRANCH" ]] || {
  echo "Checkout must be on branch $BRANCH" >&2; exit 1;
}
origin_url="$(git -C "$SOURCE_DIR" remote get-url origin)"
case "$origin_url" in
  https://gitee.com/lichuanjie31/codehive-community-website.git|https://gitee.com/lichuanjie31/codehive-community-website|git@gitee.com:lichuanjie31/codehive-community-website.git) ;;
  *) echo "origin must point to the Gitee community website repository" >&2; exit 1 ;;
esac
[[ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ]] || {
  echo "Checkout has local changes; commit or move them before deploying" >&2; exit 1;
}

mkdir -p "$BACKUP_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another deployment is running" >&2; exit 1; }

echo "Fetching $BRANCH from Gitee..."
git -C "$SOURCE_DIR" fetch origin "$BRANCH"
git -C "$SOURCE_DIR" merge --ff-only FETCH_HEAD

echo "Installing dependencies and checking the build..."
cd "$SOURCE_DIR"
npm ci
npm run build
npm test
npm run lint

[[ -f dist/index.html && -d dist/assets ]] || { echo "Build output is incomplete" >&2; exit 1; }
revision="$(git rev-parse --short HEAD)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -f "$SITE_ROOT/index.html" ]]; then
  cp -p "$SITE_ROOT/index.html" "$BACKUP_DIR/index-$stamp-$revision.html"
fi

# Publish assets before replacing the entry page. Existing files stay in place,
# so the previous index backup can still refer to its original assets.
rsync -rlt --exclude='/index.html' dist/ "$SITE_ROOT/"
temporary_index="$(mktemp "$SITE_ROOT/.index.html.XXXXXX")"
trap 'rm -f "$temporary_index"' EXIT
cp dist/index.html "$temporary_index"
chmod 644 "$temporary_index"
mv -f "$temporary_index" "$SITE_ROOT/index.html"
trap - EXIT

echo "Published revision $revision to $SITE_ROOT"
echo "Previous index backups: $BACKUP_DIR"
