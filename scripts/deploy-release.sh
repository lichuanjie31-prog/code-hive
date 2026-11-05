#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
archive=${1:?archive required}
id=${2:?release ID required}
mode=${3:?mode required}
[[ "$id" =~ ^[a-f0-9]{40}-[a-f0-9]{12}$ ]] || exit 2
[[ "$archive" == "/tmp/codehive-$id.tgz" && -f "$archive" && ! -L "$archive" ]] || exit 2
[[ "$mode" == frontend || "$mode" == fullstack ]] || exit 2
for command in tar flock rsync curl realpath; do command -v "$command" >/dev/null; done
config=/etc/codehive/deploy.env
[[ -f "$config" ]] || { echo "Missing $config" >&2; exit 1; }
set -a
source "$config"
set +a
SITE_ROOT=$(realpath "${SITE_ROOT:?}")
[[ "$SITE_ROOT" == /www/wwwroot/* && -d "$SITE_ROOT" ]] || exit 2
[[ ! -e "$SITE_ROOT/.git" && ! -e "$SITE_ROOT/.env" && ! -e "$SITE_ROOT/backend" ]] || exit 2
[[ "${SITE_ORIGIN:?}" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || exit 2
base=/www/codehive-deploy
mkdir -p "$base/releases" "$base/backups"
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
release="$base/releases/$id"
mkdir "$release"
tar -xzf "$archive" -C "$release"
rm -f "$archive"
tar -xf "$release/source.tar" -C "$release"
rm -f "$release/source.tar"
[[ -f "$release/dist/index.html" && -d "$release/dist/assets" ]] || exit 2
export RELEASE_ID="$id"
compose() { docker compose --env-file "$config" -f "$release/deploy/compose.yml" "$@"; }
previous=''
[[ ! -f "$base/current-fullstack" ]] || previous=$(cat "$base/current-fullstack")
[[ -z "$previous" || "$previous" =~ ^[a-f0-9]{40}-[a-f0-9]{12}$ ]] || exit 2
had_index=false
if [[ -f "$SITE_ROOT/index.html" ]]; then
  cp -p "$SITE_ROOT/index.html" "$base/backups/index-$id.html"
  had_index=true
fi
api_changed=false
index_changed=false
nginx_changed=false
nginx_mode=${NGINX_MODE:-auto}
if [[ "$nginx_mode" == auto ]]; then
  if systemctl is-active --quiet nginx && [[ -d /etc/nginx/bt-vhosts/extension/codehive.asia ]]; then
    nginx_mode=system
  else
    nginx_mode=baota
  fi
fi
case "$nginx_mode" in
  system) nginx_config=/etc/nginx/bt-vhosts/extension/codehive.asia/codehive-api.conf ;;
  baota) nginx_config=/www/server/panel/vhost/nginx/extension/codehive.asia/codehive-api.conf ;;
  *) echo 'NGINX_MODE must be auto, system or baota' >&2; exit 2 ;;
esac
nginx_reload() {
  if [[ "$nginx_mode" == system ]]; then
    /usr/sbin/nginx -t -c /etc/nginx/nginx.conf && systemctl reload nginx
  else
    /www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
  fi
}
rollback() {
  status=$?
  trap - ERR
  set +e
  if $nginx_changed; then
    if [[ -f "$base/backups/nginx-$id.conf" ]]; then
      cp -p "$base/backups/nginx-$id.conf" "$nginx_config"
    else
      rm -f "$nginx_config"
    fi
    nginx_reload
  fi
  if $index_changed; then
    if $had_index; then
      cp "$base/backups/index-$id.html" "$SITE_ROOT/.rollback-index"
      chmod 644 "$SITE_ROOT/.rollback-index"
      mv -f "$SITE_ROOT/.rollback-index" "$SITE_ROOT/index.html"
    else
      rm -f "$SITE_ROOT/index.html"
    fi
  fi
  if $api_changed; then
    if [[ -n "$previous" ]]; then
      RELEASE_ID="$previous" docker compose --env-file "$config" -f "$base/releases/$previous/deploy/compose.yml" up -d --no-build --no-deps --wait --wait-timeout 180 api
    else
      compose stop api
    fi
  fi
  echo "Deployment failed. Review logs and $base/backups. Database migrations are NOT automatically reversed." >&2
  exit "$status"
}
trap rollback ERR
if [[ "$mode" == fullstack ]]; then
  [[ "${POSTGRES_PASSWORD:-}" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'Use a 64-character hex database password' >&2; exit 2; }
  docker compose version
  compose build api
  compose up -d --wait --wait-timeout 180 db
  # Abort before migration if a consistent database backup cannot be created.
  compose exec -T db pg_dump -U codehive -d codehive -Fc </dev/null > "$base/backups/database-$id.dump"
  test -s "$base/backups/database-$id.dump"
  compose run --rm -T --no-deps api python -m alembic upgrade head </dev/null
  api_changed=true
  compose up -d --no-deps --wait --wait-timeout 180 api
  curl --fail --silent --show-error --max-time 15 http://127.0.0.1:8100/api/competitions >/dev/null
  if [[ -f "$nginx_config" ]]; then cp -p "$nginx_config" "$base/backups/nginx-$id.conf"; fi
  nginx_changed=true
  install -m 644 "$release/deploy/nginx-api.conf.example" "$nginx_config"
  nginx_reload
fi
# Existing hashed assets remain available to clients holding the previous page.
rsync -rltp --chmod=D755,F644 --exclude='/index.html' "$release/dist/" "$SITE_ROOT/"
cp "$release/dist/index.html" "$SITE_ROOT/.index-$id"
chmod 644 "$SITE_ROOT/.index-$id"
index_changed=true
mv -f "$SITE_ROOT/.index-$id" "$SITE_ROOT/index.html"
curl --fail --silent --show-error --max-time 30 "$SITE_ORIGIN/?release=$id" -o "$release/served-index.html"
cmp "$release/dist/index.html" "$release/served-index.html"
while IFS= read -r -d '' asset; do
  curl --fail --silent --show-error --max-time 30 "$SITE_ORIGIN${asset#"$release/dist"}" -o /dev/null
done < <(find "$release/dist/assets" -type f -print0)
if [[ "$mode" == fullstack ]]; then
  curl --fail --silent --show-error --max-time 30 "$SITE_ORIGIN/api/competitions" | docker compose --env-file "$config" -f "$release/deploy/compose.yml" exec -T api python -c 'import json,sys; d=json.load(sys.stdin); assert isinstance(d["items"], list) and isinstance(d["total"], int)'
  printf '%s\n' "$id" > "$base/current-fullstack.tmp"
  mv "$base/current-fullstack.tmp" "$base/current-fullstack"
fi
printf '%s\n' "$id" > "$base/current.tmp"
mv "$base/current.tmp" "$base/current"
trap - ERR
echo "Deployed and verified $id ($mode)"
