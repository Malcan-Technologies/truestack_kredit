# Signing gateway: on-prem server bootstrap

This guide is the **operational checklist** for preparing a new (or rebuilt) on-prem host so **GitHub Actions** can deploy the signing stack via **SSH through Cloudflare Access**.

For **Cloudflare Tunnel, DNS, Access applications, and service tokens**, use the full client runbook: [`signing-gateway-client-onboarding.md`](./signing-gateway-client-onboarding.md).

---

## What you are setting up

| Layer | Purpose |
|--------|--------|
| `sshd` on the server | Tunnel forwards SSH to `127.0.0.1:22` (or your chosen port). |
| Linux user `deploy` | CI connects as this user; must be in the `docker` group. |
| SSH keypair | **Private** key → GitHub secret `ONPREM_SSH_KEY`. **Public** key → `/home/deploy/.ssh/authorized_keys`. |
| `/opt/signing-stack` | Compose file, `deploy.sh`, data dirs; CI overwrites compose/script on each deploy. |
| Docker + Compose | `deploy.sh` runs `docker compose`; install the **Compose v2** plugin on Ubuntu. |
| GitHub **environment** | e.g. `pro-<client-id>` — all signing deploy secrets live here, not only repository secrets. |

**Important:** The **private** SSH key is **never** stored on the server. Only the public key is in `authorized_keys`. Generate the pair on a trusted machine (usually your laptop), set the secret with `gh` or the GitHub UI, then install the matching public key on the server.

---

## 1. Server packages and SSH

On the on-prem host (Ubuntu example):

```bash
# Docker (if not already installed)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # optional for your admin user; deploy gets docker in step 2

# Compose v2 (Ubuntu docker.io often lacks `docker compose`)
sudo apt update
sudo apt install -y docker-compose-v2
docker compose version
```

Confirm SSH is listening where the tunnel expects (often port **22**):

```bash
systemctl is-active ssh || systemctl is-active sshd
ss -tlnp | grep ':22'
```

Optional: UDP buffer tuning for tunnel stability is documented in [`signing-gateway-client-onboarding.md`](./signing-gateway-client-onboarding.md) (sysctl).

---

## 2. Upload files from the monorepo (your laptop)

From the **repository root** on a machine that can SSH to the server as an admin user (e.g. `tkpro-pp`):

```bash
export SERVER=tkpro-pp@tkpro-pp   # adjust user@host

# Public key for the *first* provision (generate a dedicated CI key)
ssh-keygen -t ed25519 -f ./signing-gw-ci -N "" -C "signing-gateway-ci"
# Later: put the private key in GitHub (step 4)

scp ./signing-gw-ci.pub            "$SERVER:~/signing-gw-deploy.pub"
scp apps/signing-gateway/docker-compose.prod.yml \
    "$SERVER:~/signing-gw-docker-compose.yml"
scp scripts/signing-gateway/deploy.sh \
    "$SERVER:~/signing-gw-deploy.sh"
scp scripts/signing-gateway/provision-onprem-root.sh \
    "$SERVER:~/signing-gw-provision-root.sh"
```

---

## 3. Run the root provisioner on the server

SSH in as the **same user** whose home received the files, then:

```bash
chmod +x ~/signing-gw-provision-root.sh
sudo bash ~/signing-gw-provision-root.sh YOUR_LINUX_USER
# Example: sudo bash ~/signing-gw-provision-root.sh tkpro-pp
```

This script (`scripts/signing-gateway/provision-onprem-root.sh` in the repo):

- Creates `deploy` (if missing) and adds it to group `docker`
- Installs `~/signing-gw-deploy.pub` as `/home/deploy/.ssh/authorized_keys`
- Creates `/opt/signing-stack` and data directories
- Installs `docker-compose.yml` and `deploy.sh`

CI will refresh `docker-compose.yml` and `deploy.sh` on later runs; the dirs and `deploy` user remain.

---

## 4. GitHub environment secret `ONPREM_SSH_KEY`

On a machine with [`gh`](https://cli.github.com/) logged in:

```bash
export REPO=Malcan-Technologies/truestack_kredit   # your org/repo
export ENV=pro-proficient-premium                  # must match aws.github_environment in config/clients/<id>.yaml

gh secret set ONPREM_SSH_KEY --env "$ENV" --repo "$REPO" < ./signing-gw-ci
```

Remove the local private key file when finished if you do not need it:

```bash
shred -u ./signing-gw-ci 2>/dev/null || rm -f ./signing-gw-ci
```

**Rotating the key later**

1. Generate a new keypair.
2. Update GitHub: `gh secret set ONPREM_SSH_KEY --env "$ENV" --repo "$REPO" < new_private_key`
3. On the server:  
   `sudo install -m 600 -o deploy -g deploy /path/to/new_public.pub /home/deploy/.ssh/authorized_keys`

Do **not** install `gh` on the on-prem server for this; it is only for managing GitHub from your workstation.

---

## 5. Environment secrets checklist

The **Deploy Signing Gateway** workflow expects the GitHub **environment** (e.g. `pro-proficient-premium`) to include at least:

| Secret | Purpose |
|--------|---------|
| `AWS_ROLE_ARN` | OIDC → assume role, ECR login and image reference |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access service token (SSH + API) |
| `CF_ACCESS_CLIENT_SECRET` | Same token’s secret |
| `ONPREM_SSH_KEY` | Private key for user `deploy` |
| `ONPREM_CF_TUNNEL_TOKEN` | Tunnel token; written into on-prem `.env` as `CF_TUNNEL_TOKEN` |
| `ONPREM_MTSA_USERNAME` | MTSA SOAP user |
| `ONPREM_MTSA_PASSWORD` | MTSA SOAP password |
| `ONPREM_SIGNING_API_KEY` | Signing gateway API key (must match backend / Secrets Manager) |

Optional:

| Secret | Purpose |
|--------|---------|
| `ONPREM_MTSA_IMAGE` | If set, on-prem uses this MTSA image ref; else CI uses the ECR tag it pushed |
| `ONPREM_SIGNING_GATEWAY_PUBLIC_IP` | Static IP in PDF footer when egress IP discovery fails |

List (names only):

```bash
gh secret list --env "$ENV" --repo "$REPO"
```

---

## 6. Post-bootstrap verification (on the server)

```bash
docker --version
docker compose version
id deploy
groups deploy    # should include docker
sudo test -s /home/deploy/.ssh/authorized_keys && echo "authorized_keys OK"
ls -la /opt/signing-stack/
```

After a successful workflow run you should see containers and a local health check:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
curl -sS http://127.0.0.1:3100/health
```

---

## 7. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Log shows a **browser / `cdn-cgi/access/cli?...` URL** in Actions | `cloudflared` is **not** using a service token (empty `--id`/`--secret`, or wrong env). Ensure **`CF_ACCESS_CLIENT_ID`** and **`CF_ACCESS_CLIENT_SECRET`** exist on the **same GitHub Environment** as the job (e.g. `pro-proficient-premium`), not only at repo level if the environment overrides them. Recreate the secrets if they were pasted with an extra **newline**. The deploy workflow strips CR/LF and fails fast if either value is empty. |
| `failed to run transfer service` / `Failed to fetch resource` / `Connection closed` after the browser message | Usually the same root cause as above (CLI OAuth path in CI). Fix Access token secrets first; confirm the **SSH** Access app allows **any valid service token**. |
| `websocket: bad handshake` | SSH hostname must use an **SSH-type** Access app; tunnel ingress must be **SSH** to the host’s `sshd`, not HTTP to the gateway. |
| Permission denied (publickey) for `deploy` | `authorized_keys` must match the **public** half of `ONPREM_SSH_KEY`. |
| `docker compose` not found | Install `docker-compose-v2` (Ubuntu) or the official Docker Compose plugin. |
| `deploy` cannot pull images | User must be in `docker` group; log out/in or new session after `usermod`. |

---

## 8. Security notes

- Treat any private key that appeared in logs, chat, or CI output as **compromised**: rotate using section 4.
- The on-prem host does **not** need Cloudflare Access **client** secrets for SSH; only the GitHub runner’s `cloudflared access ssh` uses them. The server only needs normal `sshd` and `authorized_keys`.
- Restrict who can SSH as `deploy`; prefer CI-only keys and no shared passwords.

---

## Related files in this repo

- `scripts/signing-gateway/provision-onprem-root.sh` — idempotent server bootstrap (run with `sudo`)
- `scripts/signing-gateway/deploy.sh` — pulled/run on the server by CI
- `apps/signing-gateway/docker-compose.prod.yml` — production compose (copied as `docker-compose.yml` on the server)
- `config/clients/<client-id>.yaml` — `signing.ssh_host`, `github_environment`, etc.
- `.github/workflows/deploy-signing-gateway.yml` — deploy automation
