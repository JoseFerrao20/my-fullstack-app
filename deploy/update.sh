#!/bin/sh
# Update production to a commit (default: the latest main) and restart it.
#
#   sh deploy/update.sh            # latest main
#   sh deploy/update.sh <commit>   # a specific commit (the deploy workflow passes the one CI tested)
#
# Backs up the database first (the new version may run migrations on start), then rebuilds,
# restarts and waits until the backend reports healthy.
set -eu

# Everything is inside a function so the shell has parsed the whole script before
# `git checkout` replaces this file with the new version.
main() {
  cd "$(dirname "$0")/.."
  ref="${1:-origin/main}"
  compose="docker compose -f docker-compose.prod.yml --env-file .env.production"

  if [ ! -f .env.production ]; then
    echo "error: .env.production is missing (see docs/deploy.md)" >&2
    exit 1
  fi

  git fetch --quiet origin
  git checkout --quiet --detach "$ref"
  echo "==> Deploying $(git log -1 --format='%h %s')"

  if [ -n "$($compose ps --quiet backup 2>/dev/null)" ]; then
    echo "==> Backing up the database before updating"
    $compose exec -T backup sh /scripts/backup.sh
  fi

  echo "==> Building"
  $compose build --pull

  echo "==> Restarting"
  $compose up -d --remove-orphans

  echo "==> Waiting for the backend to be healthy (migrations run on start)"
  tries=0
  until [ "$($compose ps --format '{{.Health}}' backend)" = "healthy" ]; do
    tries=$((tries + 1))
    if [ "$tries" -gt 90 ]; then
      echo "error: backend is not healthy after 3 minutes; last logs:" >&2
      $compose logs --tail 60 backend >&2
      exit 1
    fi
    sleep 2
  done

  docker image prune -f > /dev/null
  echo "==> Deployed $(git log -1 --format='%h') and healthy"
}

main "$@"
exit
