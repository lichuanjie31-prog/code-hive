#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
for command in docker rsync curl tar flock openssl; do command -v "$command" >/dev/null; done
docker compose version
test -d /www/wwwroot/codehive.asia
test -d /www/server/panel/vhost/nginx/extension/codehive.asia
install -d -m 700 /etc/codehive /www/codehive-deploy /www/codehive-deploy/backups
if [[ ! -f /etc/codehive/deploy.env ]]; then
  secret=$(openssl rand -hex 32)
  printf 'SITE_ROOT=/www/wwwroot/codehive.asia\nSITE_ORIGIN=https://codehive.asia\nPOSTGRES_PASSWORD=%s\n' "$secret" > /etc/codehive/deploy.env
  unset secret
  chmod 600 /etc/codehive/deploy.env
fi
if [[ ! -f /www/codehive-deploy/backups/before-cicd.tar.gz ]]; then
  tar -czf /www/codehive-deploy/backups/before-cicd.tar.gz -C /www/wwwroot/codehive.asia .
fi
echo 'Server configuration and initial site backup ready.'
