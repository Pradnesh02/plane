#!/usr/bin/env bash
# Public https link to this Plane via a Cloudflare quick tunnel (free, no account).
# The link works while this machine and Plane are running, and changes on every run,
# so this also points WEB_URL/CORS at it (Plane redirects to WEB_URL after sign-in).
# The tunnel does not survive a reboot: run this again afterwards for a new link.
# Usage, from this folder inside WSL/Linux: bash tunnel.sh       (start, or get a fresh link)
#                                            bash tunnel.sh stop  (back to http://localhost only)
set -e
cd "$(dirname "$0")"
up() { docker compose -p plane --env-file plane.env -f docker-compose.yml -f docker-compose.local.yml up -d >/dev/null 2>&1; }
docker rm -f plane-tunnel >/dev/null 2>&1 || true
if [ "$1" = stop ]; then
  sed -i 's#^WEB_URL=.*#WEB_URL=http://${APP_DOMAIN}#; s#^CORS_ALLOWED_ORIGINS=.*#CORS_ALLOWED_ORIGINS=http://${APP_DOMAIN}#' plane.env
  up && echo "Tunnel stopped; Plane is local only (http://localhost)."
  exit 0
fi
docker run -d --name plane-tunnel --network plane_default \
  cloudflare/cloudflared:2024.12.2 tunnel --no-autoupdate --url http://proxy:80 >/dev/null
for i in $(seq 1 60); do
  url=$(docker logs plane-tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | head -1)
  [ -n "$url" ] && break
  sleep 3
done
[ -n "$url" ] || { echo "tunnel did not start:"; docker logs plane-tunnel 2>&1 | tail -5; exit 1; }
sed -i "s#^WEB_URL=.*#WEB_URL=$url#; s#^CORS_ALLOWED_ORIGINS=.*#CORS_ALLOWED_ORIGINS=http://localhost,$url#" plane.env
up
echo "Plane is public at: $url"
