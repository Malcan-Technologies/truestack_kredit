#!/bin/bash
# Run on the on-prem host as root: sudo bash provision-onprem-root.sh <ssh_user_who_received_uploads>
# Expects in that user's home directory (upload via scp from your laptop):
#   signing-gw-deploy.pub
#   signing-gw-docker-compose.yml
#   signing-gw-deploy.sh
set -euo pipefail

SOURCE_USER="${1:-}"
if [[ -z "${SOURCE_USER}" ]]; then
  echo "Usage: sudo bash $0 <user>" >&2
  echo "Example: sudo bash $0 tkpro-pp" >&2
  exit 1
fi

SRC_HOME=$(getent passwd "${SOURCE_USER}" | cut -d: -f6)
if [[ -z "${SRC_HOME}" || ! -d "${SRC_HOME}" ]]; then
  echo "No home directory for user: ${SOURCE_USER}" >&2
  exit 1
fi

PUB="${SRC_HOME}/signing-gw-deploy.pub"
COMPOSE_SRC="${SRC_HOME}/signing-gw-docker-compose.yml"
DEPLOY_SRC="${SRC_HOME}/signing-gw-deploy.sh"

for f in "$PUB" "$COMPOSE_SRC" "$DEPLOY_SRC"; do
  if [[ ! -f "$f" ]]; then
    echo "Missing file: $f" >&2
    exit 1
  fi
done

if ! id deploy &>/dev/null; then
  useradd -m -s /bin/bash deploy
fi
usermod -aG docker deploy

install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy "$PUB" /home/deploy/.ssh/authorized_keys

install -d -m 755 /opt/signing-stack/data/documents /opt/signing-stack/data/db
chown -R deploy:deploy /opt/signing-stack

install -m 644 "$COMPOSE_SRC" /opt/signing-stack/docker-compose.yml
install -m 755 "$DEPLOY_SRC" /opt/signing-stack/deploy.sh
chown deploy:deploy /opt/signing-stack/docker-compose.yml /opt/signing-stack/deploy.sh

echo "Provisioning complete."
echo "Set GitHub environment secret ONPREM_SSH_KEY to the private key matching signing-gw-deploy.pub"
