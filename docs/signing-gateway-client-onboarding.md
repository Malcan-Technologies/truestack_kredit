# Signing Gateway: Client Onboarding Guide

This document covers the complete setup for deploying the on-prem Signing Gateway stack to a new Pro client. It is designed to be followed by an AI assistant with CLI access, or manually by an operator.

**Reference implementation**: `demo-client` — see `config/clients/demo-client.yaml` for a working example.

---

## Architecture Overview

Each Pro client gets an on-prem signing stack consisting of three Docker containers:

| Container | Image Source | Purpose |
|-----------|-------------|---------|
| `signing-gateway` | ECR (built by CI/CD) | Express API that orchestrates document signing |
| `mtsa` | Local (loaded from Trustgate tarball) | Trustgate's Java/Tomcat PKI signing agent |
| `cloudflared` | Docker Hub | Cloudflare Tunnel connector for secure ingress |

The stack runs on the client's on-prem server. GitHub Actions deploys updates via SSH through a Cloudflare Tunnel — no VPN or open ports required.

**Key files in the monorepo**:
- `apps/signing-gateway/docker-compose.prod.yml` — production Docker Compose definition
- `scripts/signing-gateway/deploy.sh` — deployment script executed on the server
- `config/clients/<client-id>.yaml` — per-client configuration
- `.github/workflows/deploy-signing-gateway.yml` — CI/CD workflow

**Per-client MTSA pilot bundle (CI):** The demo/canary lane builds MTSA from `apps/signing-gateway/mtsa-pilot/`. Other clients (e.g. Proficient Premium) use a separate directory such as `apps/signing-gateway/mtsa-pilot-proficient-premium/` and set `signing.mtsa_build_context` in that client’s YAML so demo builds are unchanged.

---

## Prerequisites

Before starting, ensure you have:

- [ ] The client's AWS account ID and OIDC deploy role ARN
- [ ] Cloudflare account with `truestack.my` zone **active** (nameservers must point to Cloudflare)
- [ ] Cloudflare API token with permissions: `Zone > DNS > Edit`, `Account > Cloudflare Tunnel > Edit`, `Account > Access: Apps and Policies > Edit`
- [ ] The MTSA Docker image: CI builds from `apps/signing-gateway/mtsa-pilot/` (demo) or `signing.mtsa_build_context` in the client YAML (e.g. Proficient Premium), or load from a Trustgate tarball if you are not using the Dockerfile path
- [ ] MTSA SOAP credentials from Trustgate for the client
- [ ] SSH access to the client's on-prem server (root or sudo-capable user)
- [ ] GitHub CLI (`gh`) authenticated with repo access
- [ ] AWS CLI configured with the client's profile

### Cloudflare API Token

If you don't have a Cloudflare API token yet, create one:

1. Go to **[dash.cloudflare.com](https://dash.cloudflare.com) > My Profile > API Tokens > Create Token > Custom Token**
2. Permissions:
   - **Zone > DNS > Edit**
   - **Account > Cloudflare Tunnel > Edit**
   - **Account > Access: Apps and Policies > Edit**
3. Zone Resources: **Include > Specific zone > truestack.my**
4. Account Resources: **Include > your account**

Store the token and account ID for CLI use:

```bash
export CF_API_TOKEN="<your-api-token>"
export CF_ACCOUNT_ID="<your-account-id>"
export CF_ZONE_ID="<zone-id-for-truestack.my>"
```

To find the zone ID:

```bash
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=truestack.my" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])"
```

### Important: Domain Nameservers

The `truestack.my` zone **must be active** in Cloudflare (status: `active`, not `pending`) before you can create Access applications. If the zone is pending, update nameservers at your domain registrar to the ones Cloudflare assigned (visible in the Cloudflare dashboard under the zone overview).

Access applications and DNS records can only work after nameserver propagation (typically 5-30 minutes, up to 24 hours).

---

## 1. Client Registry

Create `config/clients/<client-id>.yaml`. Copy from `demo-client.yaml` and update.

The `signing:` block is required:

```yaml
signing:
  gateway_hostname: <client-id>-sign.truestack.my
  ssh_host: ssh-sign-<client-id>.truestack.my
  tunnel_name: <client-id>-onprem
  mtsa_env: pilot                                    # "pilot" for testing, "prod" for production
  backup_bucket_prefix: <client-id>
  ecr_repository: truekredit-pro-signing-gateway     # ECR repo in client's AWS account
```

Also ensure `aws.github_environment` is set (e.g., `pro-<client-id>`).

---

## 2. ECR Repository

Create the signing gateway ECR repo in the **client's** AWS account:

```bash
aws ecr create-repository \
  --repository-name truekredit-pro-signing-gateway \
  --region <client-aws-region> \
  --profile <client-aws-profile> \
  --image-scanning-configuration scanOnPush=false \
  --encryption-configuration encryptionType=AES256
```

For clients using Terraform, the `client_stack` module provisions this automatically.

---

## 3. On-Prem Server Provisioning

SSH into the client's on-prem server. All commands in this section run on the server.

### 3.1 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker
sudo systemctl enable containerd
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect
```

Enabling Docker and containerd ensures the daemon starts automatically on server reboot. The containers use `restart: unless-stopped` in the compose file, so they'll come back up with Docker.

### 3.2 Increase UDP Buffer Sizes (Cloudflare Tunnel Stability)

Cloudflare Tunnel uses the QUIC protocol which requires larger UDP buffers than the Linux default (208 KiB). Without this, `cloudflared` logs will show `failed to sufficiently increase receive buffer size` and the tunnel will experience periodic QUIC timeouts causing brief disconnections.

```bash
# Apply immediately
sudo sysctl -w net.core.rmem_max=7340032 net.core.wmem_max=7340032

# Persist across reboots
echo 'net.core.rmem_max=7340032' | sudo tee -a /etc/sysctl.conf
echo 'net.core.wmem_max=7340032' | sudo tee -a /etc/sysctl.conf
```

Verify:

```bash
sysctl net.core.rmem_max net.core.wmem_max
# Should show 7340032 for both
```

> **Important**: Do this before starting `cloudflared`. If cloudflared is already running, restart it after applying: `docker compose restart cloudflared`

### 3.3 Generate SSH Deploy Key Pair

Generate a dedicated key pair for CI/CD deployment:

```bash
ssh-keygen -t ed25519 -f deploy_key -N ""
```

This produces:

| File | Purpose | Destination |
|------|---------|-------------|
| `deploy_key` (private) | GitHub Actions authenticates with this | GitHub secret: `ONPREM_SSH_KEY` |
| `deploy_key.pub` (public) | Server accepts this key | `/home/deploy/.ssh/authorized_keys` |

**Save the private key content now** — you'll need it for GitHub secrets in Step 5:

```bash
cat deploy_key
```

Copy this output. You can also set it directly via CLI from your local machine if you have SSH access (see Step 5.2).

### 3.4 Create Deploy User

```bash
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG docker deploy

# Install the public key
sudo mkdir -p /home/deploy/.ssh
sudo cp deploy_key.pub /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

### 3.5 Create Directory Structure

```bash
sudo mkdir -p /opt/signing-stack/data/documents
sudo mkdir -p /opt/signing-stack/data/db
sudo chown -R deploy:deploy /opt/signing-stack
```

### 3.6 Copy Deployment Files

Copy the production compose file and deploy script from the monorepo. These must be owned by the `deploy` user.

**Option A — From your local machine via SCP** (if you can SSH as a user with write access):

```bash
# From the monorepo root on your local machine
scp apps/signing-gateway/docker-compose.prod.yml <server-ssh-alias>:/tmp/docker-compose.yml
scp scripts/signing-gateway/deploy.sh <server-ssh-alias>:/tmp/deploy.sh

# Then on the server, copy as deploy user (requires sudo)
sudo cp /tmp/docker-compose.yml /opt/signing-stack/docker-compose.yml
sudo cp /tmp/deploy.sh /opt/signing-stack/deploy.sh
sudo chown deploy:deploy /opt/signing-stack/docker-compose.yml /opt/signing-stack/deploy.sh
sudo chmod +x /opt/signing-stack/deploy.sh
rm /tmp/docker-compose.yml /tmp/deploy.sh
```

**Option B — Paste contents directly on the server** (if SCP is not convenient):

```bash
# As a sudo-capable user on the server
sudo -u deploy tee /opt/signing-stack/docker-compose.yml << 'EOF'
<paste contents of apps/signing-gateway/docker-compose.prod.yml>
EOF

sudo -u deploy tee /opt/signing-stack/deploy.sh << 'EOF'
<paste contents of scripts/signing-gateway/deploy.sh>
EOF

sudo chmod +x /opt/signing-stack/deploy.sh
```

### 3.7 Load MTSA Docker Image

**Option A — From Trustgate tarball**:

```bash
docker load -i /path/to/MTSAPilot.tar    # for pilot
# or
docker load -i /path/to/MTSA.tar          # for production

# Verify the image name and tag
docker images | grep -i mtsa
```

**Option B — Build from repo source** (for pilot environment):

The pilot MTSA can be built from `apps/signing-gateway/mtsa-pilot/`. You need the WAR file from Trustgate placed in `apps/signing-gateway/mtsa-pilot/webapps/` (it's gitignored).

```bash
# On the server, after transferring the mtsa-pilot directory + WAR file
cd /path/to/mtsa-pilot
docker build -t mtsa-pilot:latest .

# Verify
docker images | grep mtsa-pilot
```

Note the image name and tag (e.g., `mtsa-pilot:latest`). This becomes the `ONPREM_MTSA_IMAGE` GitHub secret.

### 3.8 Clean Up Key Material

After the private key is saved to GitHub Secrets (Step 5):

```bash
rm deploy_key
# Optionally keep deploy_key.pub as reference
```

---

## 4. Cloudflare Setup

All steps below can be done via the Cloudflare dashboard **or** via CLI using the API token. CLI commands are provided for AI-assisted automation.

### Environment variables for CLI

```bash
export CF_API_TOKEN="<your-api-token>"
export CF_ACCOUNT_ID="<your-account-id>"
export CF_ZONE_ID="<zone-id-for-truestack.my>"
export CLIENT_ID="<client-id>"
```

### 4.1 Create Tunnel

**Dashboard**: Zero Trust > Networks > Tunnels > Create a tunnel > Cloudflared connector

**CLI**:

```bash
TUNNEL_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel" \
  -d "{
    \"name\": \"${CLIENT_ID}-onprem\",
    \"config_src\": \"cloudflare\",
    \"tunnel_secret\": \"$(openssl rand -base64 32)\"
  }")

TUNNEL_ID=$(echo "$TUNNEL_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['id'])")
echo "Tunnel ID: $TUNNEL_ID"
```

**Get the tunnel token** (needed for the `ONPREM_CF_TUNNEL_TOKEN` secret):

- **Dashboard**: After creating the tunnel, select Docker as the connector environment. Copy the token from the `docker run` command (the long base64 string after `--token`). You do NOT need to run the command — just copy the token.
- **CLI**: The tunnel token is available in the tunnel details. For remotely-managed tunnels created via dashboard, retrieve the token from the connector install page.

### 4.2 Configure Public Hostnames

Add two routes to the tunnel. Note the SSH service URL uses `host.docker.internal:22` because `cloudflared` runs inside a Docker container and needs to reach the host's SSH daemon.

**Dashboard**: Tunnel > Public Hostnames > Add

| Public Hostname | Service | Notes |
|----------------|---------|-------|
| `<client-id>-sign.truestack.my` | `http://signing-gateway:3100` | Uses Docker service name (same compose network) |
| `ssh-sign-<client-id>.truestack.my` | `ssh://host.docker.internal:22` | Reaches host SSH via Docker's host gateway |

**CLI**:

```bash
curl -s -X PUT \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -d "{
    \"config\": {
      \"ingress\": [
        {
          \"hostname\": \"${CLIENT_ID}-sign.truestack.my\",
          \"service\": \"http://signing-gateway:3100\",
          \"originRequest\": {}
        },
        {
          \"hostname\": \"ssh-sign-${CLIENT_ID}.truestack.my\",
          \"service\": \"ssh://host.docker.internal:22\",
          \"originRequest\": {}
        },
        {
          \"service\": \"http_status:404\"
        }
      ]
    }
  }"
```

### 4.3 Create DNS Records

CNAME records point the subdomains to the tunnel. Both must be proxied (orange cloud).

**CLI**:

```bash
# Signing API hostname
curl -s -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
  -d "{
    \"type\": \"CNAME\",
    \"name\": \"${CLIENT_ID}-sign\",
    \"content\": \"${TUNNEL_ID}.cfargotunnel.com\",
    \"proxied\": true,
    \"ttl\": 1
  }"

# SSH hostname
curl -s -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
  -d "{
    \"type\": \"CNAME\",
    \"name\": \"ssh-sign-${CLIENT_ID}\",
    \"content\": \"${TUNNEL_ID}.cfargotunnel.com\",
    \"proxied\": true,
    \"ttl\": 1
  }"
```

> **Note**: If the tunnel was created via the Cloudflare dashboard and public hostnames were added there, CNAME records are created automatically. Manual DNS creation is only needed when configuring tunnels via API.

### 4.4 Create Service Token

The service token authenticates both GitHub Actions (SSH deployments) and `backend_pro` (signing API calls) through Cloudflare Access. The same token is used for both. The Client Secret is **only shown once** at creation time.

**Dashboard**: Zero Trust > Access > Service Auth > Service Tokens > Create

- Name: `<client-id>-onprem-deploy`
- Duration: Non-expiring (rotate manually as needed)
- Copy **both** Client ID and Client Secret immediately

**CLI** (service tokens must be created via dashboard — the API does not expose the client secret after creation).

Save the values — they go to **two places**:

| Value | GitHub Secret | AWS Secrets Manager Key |
|-------|--------------|------------------------|
| Client ID | `CF_ACCESS_CLIENT_ID` | `CF_ACCESS_CLIENT_ID` |
| Client Secret | `CF_ACCESS_CLIENT_SECRET` | `CF_ACCESS_CLIENT_SECRET` |

GitHub secrets are used by the CI/CD SSH deployment. AWS Secrets Manager values are used by `backend_pro` at runtime to call the signing API.

### 4.5 Create Access Applications

Two Access applications are needed — one for SSH (CI/CD) and one for the signing API (runtime). Both use the same service token. **Requires the zone to be active** (nameservers pointed to Cloudflare).

#### 4.5a SSH Access Application

**Dashboard**:

1. Zero Trust > Access > Applications > Add an application > Self-hosted
2. Application domain: `ssh-sign-<client-id>.truestack.my`
3. Session duration: 24 hours
4. Create a policy:
   - Name: `Service Token Only`
   - Action: **Service Auth**
   - Rule: Include > **Any valid service token**
5. Save

**CLI**:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/access/apps" \
  -d "{
    \"name\": \"${CLIENT_ID} On-Prem SSH\",
    \"domain\": \"ssh-sign-${CLIENT_ID}.truestack.my\",
    \"type\": \"ssh\",
    \"session_duration\": \"24h\",
    \"policies\": [
      {
        \"name\": \"Service Token Only\",
        \"decision\": \"non_identity\",
        \"include\": [{\"any_valid_service_token\": {}}]
      }
    ]
  }"
```

#### 4.5b Signing API Access Application

This blocks all public access to the signing gateway API. Only `backend_pro` (with the service token headers) can reach it.

**Dashboard**:

1. Zero Trust > Access > Applications > Add an application > Self-hosted
2. Application domain: `<client-id>-sign.truestack.my`
3. Session duration: 24 hours
4. Create a policy:
   - Name: `Service Token Only`
   - Action: **Service Auth**
   - Rule: Include > **Any valid service token**
5. Save

**CLI**:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/access/apps" \
  -d "{
    \"name\": \"${CLIENT_ID} Signing Gateway API\",
    \"domain\": \"${CLIENT_ID}-sign.truestack.my\",
    \"type\": \"self_hosted\",
    \"session_duration\": \"24h\",
    \"policies\": [
      {
        \"name\": \"Service Token Only\",
        \"decision\": \"non_identity\",
        \"include\": [{\"any_valid_service_token\": {}}]
      }
    ]
  }"
```

#### Verification

```bash
# Should return 403 (blocked)
curl -s -o /dev/null -w "HTTP %{http_code}" https://<client-id>-sign.truestack.my/health

# Should return 200 (allowed with service token)
curl -s -o /dev/null -w "HTTP %{http_code}" \
  -H "CF-Access-Client-Id: <client-id-value>" \
  -H "CF-Access-Client-Secret: <client-secret-value>" \
  https://<client-id>-sign.truestack.my/health
```

> **Troubleshooting**: If Access app creation returns `"domain does not belong to zone"`, the zone is still in pending status. Wait for nameserver propagation and try again.

---

## 5. GitHub Environment Setup

### 5.1 Create GitHub Environment

**Dashboard**: Repo Settings > Environments > New environment > name: `pro-<client-id>`

For external (non-demo) clients, add **required reviewers** for deployment approval.

**CLI**:

```bash
# GitHub CLI doesn't directly create environments, but setting a secret auto-creates it
```

### 5.2 Generate Signing API Key

```bash
openssl rand -base64 32 | tr -d '=' | tr '+/' '-_'
```

Save this value — it's used for both `ONPREM_SIGNING_API_KEY` and the `signing_api_key` in AWS Secrets Manager (they must match).

### 5.3 Add All Secrets via CLI

```bash
REPO="Malcan-Technologies/truestack_kredit"
ENV="pro-<client-id>"

# AWS
echo '<arn:aws:iam::ACCOUNT:role/ROLE>' | gh secret set AWS_ROLE_ARN --env "$ENV" --repo "$REPO"

# SSH key (retrieve from server or paste)
# Option A: If you have SSH access to the server
ssh <server> "cat /path/to/deploy_key" | gh secret set ONPREM_SSH_KEY --env "$ENV" --repo "$REPO"

# Option B: Paste directly
gh secret set ONPREM_SSH_KEY --env "$ENV" --repo "$REPO" < deploy_key

# Cloudflare
echo '<service-token-client-id>' | gh secret set CF_ACCESS_CLIENT_ID --env "$ENV" --repo "$REPO"
echo '<service-token-client-secret>' | gh secret set CF_ACCESS_CLIENT_SECRET --env "$ENV" --repo "$REPO"
echo '<tunnel-token>' | gh secret set ONPREM_CF_TUNNEL_TOKEN --env "$ENV" --repo "$REPO"

# MTSA
echo '<soap-username>' | gh secret set ONPREM_MTSA_USERNAME --env "$ENV" --repo "$REPO"
echo '<soap-password>' | gh secret set ONPREM_MTSA_PASSWORD --env "$ENV" --repo "$REPO"
echo '<image-name:tag>' | gh secret set ONPREM_MTSA_IMAGE --env "$ENV" --repo "$REPO"

# Signing API key (generated in 5.2)
echo '<generated-key>' | gh secret set ONPREM_SIGNING_API_KEY --env "$ENV" --repo "$REPO"
```

### 5.4 Verify All Secrets

```bash
gh secret list --env "$ENV" --repo "$REPO"
```

Expected output — all 9 secrets:

| Secret | Source |
|--------|--------|
| `AWS_ROLE_ARN` | Client's AWS OIDC deploy role |
| `ONPREM_SSH_KEY` | Private key from Step 3.2 |
| `CF_ACCESS_CLIENT_ID` | Service token from Step 4.4 |
| `CF_ACCESS_CLIENT_SECRET` | Service token from Step 4.4 |
| `ONPREM_CF_TUNNEL_TOKEN` | Tunnel token from Step 4.1 |
| `ONPREM_MTSA_USERNAME` | Issued by Trustgate |
| `ONPREM_MTSA_PASSWORD` | Issued by Trustgate |
| `ONPREM_MTSA_IMAGE` | From `docker images` output (e.g., `mtsa-pilot:latest`) |
| `ONPREM_SIGNING_API_KEY` | Generated in Step 5.2 |

---

## 6. AWS Secrets Manager

Add signing-related keys to the client's existing app secret in AWS Secrets Manager. These are read by `backend_pro` at runtime via the ECS task definition.

The secret ARN is in the client YAML at `secrets.app_secrets_arn`.

| Key | Value | Purpose |
|-----|-------|---------|
| `signing_gateway_url` | `https://<client-id>-sign.truestack.my` | Signing gateway endpoint |
| `signing_api_key` | Same value as `ONPREM_SIGNING_API_KEY` | Must match on-prem gateway |
| `signing_enabled` | `true` | Enables signing features in backend |
| `CF_ACCESS_CLIENT_ID` | Service token Client ID (from Step 4.4) | Cloudflare Access auth for signing API |
| `CF_ACCESS_CLIENT_SECRET` | Service token Client Secret (from Step 4.4) | Cloudflare Access auth for signing API |

```bash
CLIENT_SECRET_ARN="<from client yaml: secrets.app_secrets_arn>"
AWS_PROFILE="<client-aws-profile>"
AWS_REGION="<client-aws-region>"
SIGNING_API_KEY="<same value as ONPREM_SIGNING_API_KEY>"
CF_CLIENT_ID="<service token client id>"
CF_CLIENT_SECRET="<service token client secret>"

aws secretsmanager get-secret-value \
  --secret-id "$CLIENT_SECRET_ARN" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query SecretString --output text | \
  jq --arg url "https://${CLIENT_ID}-sign.truestack.my" \
     --arg key "$SIGNING_API_KEY" \
     --arg cfid "$CF_CLIENT_ID" \
     --arg cfsec "$CF_CLIENT_SECRET" \
     '. + {
       "signing_gateway_url": $url,
       "signing_api_key": $key,
       "signing_enabled": "true",
       "CF_ACCESS_CLIENT_ID": $cfid,
       "CF_ACCESS_CLIENT_SECRET": $cfsec
     }' | \
  aws secretsmanager put-secret-value \
    --secret-id "$CLIENT_SECRET_ARN" \
    --secret-string file:///dev/stdin \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION"
```

The ECS task definition in `terraform/pro/modules/client_stack/main.tf` maps these keys to environment variables (`SIGNING_GATEWAY_URL`, `SIGNING_API_KEY`, `SIGNING_ENABLED`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`) on the `backend_pro` container. After updating Secrets Manager, force a new ECS deployment or wait for the next CI/CD push to pick up the new values.

---

## 7. First Deployment

### 7.1 Start the Stack on the Server

SSH into the on-prem server. The first CI/CD deployment will write the `.env` and pull the signing-gateway image, but `cloudflared` and `mtsa` need to be running first so the tunnel is available for SSH.

```bash
cd /opt/signing-stack

# Create a minimal .env so compose can start mtsa and cloudflared
cat > .env <<EOF
ECR_REGISTRY=placeholder
GATEWAY_TAG=latest
MTSA_SOAP_USERNAME=placeholder
MTSA_SOAP_PASSWORD=placeholder
MTSA_WSDL_PATH=/MTSAPilot/MyTrustSignerAgentWSAPv2?wsdl
MTSA_IMAGE=mtsa-pilot:latest
SIGNING_API_KEY=placeholder
CF_TUNNEL_TOKEN=<paste-actual-tunnel-token-here>
EOF

# Start cloudflared and mtsa only (signing-gateway will fail without an ECR image — that's ok)
docker compose up -d cloudflared mtsa
```

Verify the tunnel is connected:
- Check Cloudflare dashboard: Zero Trust > Networks > Tunnels — status should show "Healthy"
- Or: `docker logs cloudflared` — look for "Connection registered"

### 7.2 Trigger CI/CD Deployment

**Dashboard**: Actions > Deploy Signing Gateway > Run workflow

- `client_id`: `<client-id>`
- `action`: `full`

**CLI**:

```bash
gh workflow run deploy-signing-gateway.yml \
  --repo Malcan-Technologies/truestack_kredit \
  -f client_id=<client-id> \
  -f action=full
```

This will:
1. Build the `signing-gateway` Docker image from source
2. Push it to the client's ECR repository
3. SSH into the on-prem server through the Cloudflare Tunnel
4. Write the complete `.env` with real values from GitHub secrets
5. Pull the image and start the `signing-gateway` container

### 7.3 Verify

After the workflow succeeds:

```bash
# On the server
docker compose ps                              # All 3 containers should be "Up"
curl http://localhost:3100/health               # Should return 200

# From any machine (once DNS has propagated)
curl https://<client-id>-sign.truestack.my/health
```

---

## 8. Docker Compose Notes

### extra_hosts for SSH access

The `cloudflared` service in `docker-compose.prod.yml` includes:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

This is required because `cloudflared` runs inside a Docker container but needs to reach the host's SSH daemon (port 22) for CI/CD deployments. The tunnel SSH route points to `ssh://host.docker.internal:22`, which resolves to the host machine via Docker's `host-gateway` mapping.

**If this line is missing**, SSH deployments through the tunnel will fail with connection refused errors.

### Container networking

- `signing-gateway` and `mtsa` communicate via Docker's internal network (e.g., `http://mtsa:8080`)
- `cloudflared` routes external traffic to `signing-gateway` via Docker service name (`http://signing-gateway:3100`)
- `cloudflared` routes SSH traffic to the host machine via `host.docker.internal:22`

### Restart behaviour on server reboot

All three services use `restart: unless-stopped` in the compose file. Combined with Docker being enabled as a systemd service (`systemctl enable docker`), containers will automatically restart when the server reboots — no manual intervention needed.

The only case where a container won't restart is if it was explicitly stopped with `docker stop` before the reboot. In that case, start it again with `docker compose up -d`.

To verify after a reboot:

```bash
cd /opt/signing-stack && docker compose ps
```

---

## 9. Secret Rotation

| Secret | Rotation Process |
|--------|-----------------|
| SSH deploy key | Generate new key pair on server, update `authorized_keys`, update GitHub secret `ONPREM_SSH_KEY`, redeploy |
| MTSA SOAP credentials | Receive new credentials from Trustgate, update GitHub secrets `ONPREM_MTSA_USERNAME` + `ONPREM_MTSA_PASSWORD`, redeploy |
| Signing API key | Generate new key (`openssl rand -base64 32 \| tr -d '=' \| tr '+/' '-_'`), update **both** GitHub secret `ONPREM_SIGNING_API_KEY` **and** AWS Secrets Manager `signing_api_key` (must match), redeploy |
| Cloudflare Tunnel token | Rotate in Cloudflare dashboard, update GitHub secret `ONPREM_CF_TUNNEL_TOKEN`, restart cloudflared on server |
| Cloudflare Access service token | Create new token in dashboard (old one can be revoked), update **both** GitHub secrets (`CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET`) **and** AWS Secrets Manager (`CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET`), redeploy signing-gateway + force new ECS deployment for backend_pro |

"Redeploy" means triggering the workflow with `action: deploy-only`:

```bash
gh workflow run deploy-signing-gateway.yml \
  --repo Malcan-Technologies/truestack_kredit \
  -f client_id=<client-id> \
  -f action=deploy-only
```

This writes the updated `.env` to the server and restarts `signing-gateway`. For secrets that affect `mtsa` or `cloudflared`, SSH into the server after the `.env` is updated and run:

```bash
cd /opt/signing-stack && docker compose up -d
```

---

## 10. Deployment Triggers

| Client Type | Trigger | Behavior |
|-------------|---------|----------|
| `demo-client` | Push to `main` with changes in `apps/signing-gateway/**` | Automatic build + deploy |
| External clients | `workflow_dispatch` with `client_id` input | Manual trigger only |

External clients are never auto-deployed. After initial setup, all deployments go through GitHub Actions — no manual SSH required.

---

## 11. Troubleshooting

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| Access app creation fails: "domain does not belong to zone" | Zone not active (nameservers not updated) | Update nameservers at registrar, wait for propagation |
| SSH deployment fails: connection refused | `extra_hosts` missing in cloudflared compose config | Add `extra_hosts: ["host.docker.internal:host-gateway"]` to cloudflared service |
| SSH deployment fails: permission denied | Wrong SSH key or deploy user misconfigured | Verify `ONPREM_SSH_KEY` matches the public key in `/home/deploy/.ssh/authorized_keys` |
| Tunnel shows "inactive" in dashboard | cloudflared container not running | Check `docker logs cloudflared`, verify `CF_TUNNEL_TOKEN` in `.env` |
| signing-gateway can't reach mtsa | MTSA container unhealthy or not started | Check `docker logs mtsa`, verify WSDL path matches mtsa_env (pilot vs prod) |
| ECR login fails in CI/CD | AWS OIDC role misconfigured or ECR repo doesn't exist | Verify `AWS_ROLE_ARN` and that the ECR repo exists in the client's account |
| `.env` not updated after deploy | deploy.sh doesn't write .env (CI/CD does) | The workflow SSH step writes `.env` before running `deploy.sh` |
| Signing health check shows offline in admin_pro | `SIGNING_GATEWAY_URL` not set in ECS task | Verify signing env vars are in Terraform ECS `secrets` block and AWS Secrets Manager |
| Signing health check shows offline intermittently | Cloudflare Tunnel QUIC connection dropping due to undersized UDP buffers | Increase UDP buffers on on-prem server (see below) |
| Signing health check shows offline consistently after DNS/provider cutover | ECS resolver path is still reaching an old provider response even though public DNS now points to Cloudflare Tunnel | Compare direct `curl` with runtime credentials vs `backend_pro` `/api/admin/signing/health`; if ECS still sees stale DNS, use the targeted public-DNS workaround in `signingGatewayClient.ts` (see below) |
| cloudflared logs: `failed to sufficiently increase receive buffer size` | Linux UDP receive/send buffer max too low (default 208 KiB, needs 7168 KiB) | Run `sudo sysctl -w net.core.rmem_max=7340032 net.core.wmem_max=7340032` and persist in `/etc/sysctl.conf`, then restart cloudflared |
| Signing health returns 401 | Auth session expired or cookie not forwarded through proxy | Re-login to admin_pro dashboard; check proxy route forwards cookies correctly |
| Signing API returns 403 | Cloudflare Access blocking the request | Ensure `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` are in AWS Secrets Manager and ECS task definition |

### 11.1 Cloudflare Tunnel Stability (UDP Buffer Tuning)

The Cloudflare Tunnel (`cloudflared`) uses QUIC protocol which requires large UDP buffers. The Linux default (208 KiB) is far too low — `cloudflared` wants 7168 KiB. This causes periodic `"timeout: no recent network activity"` errors and brief tunnel disconnections.

**Symptoms:**
- `docker logs cloudflared` shows: `failed to sufficiently increase receive buffer size (was: 208 kiB, wanted: 7168 kiB, got: 416 kiB)`
- `ERR failed to accept QUIC stream: timeout: no recent network activity`
- Signing health check intermittently shows "Offline" in admin_pro

**Fix (run on on-prem server):**

```bash
# Check current values
sysctl net.core.rmem_max net.core.wmem_max

# Apply immediately
sudo sysctl -w net.core.rmem_max=7340032 net.core.wmem_max=7340032

# Make permanent across reboots
echo 'net.core.rmem_max=7340032' | sudo tee -a /etc/sysctl.conf
echo 'net.core.wmem_max=7340032' | sudo tee -a /etc/sysctl.conf

# Restart cloudflared to pick up new buffer sizes
cd /opt/signing-stack && docker compose restart cloudflared

# Verify — logs should no longer show the buffer warning
docker logs cloudflared --tail 15
```

**Note:** This should be done during initial server setup for every new client. Add it to the on-prem server provisioning steps.

### 11.2 ECS DNS Staleness After DNS Provider Cutover

This issue appeared in production after moving `truestack.my` DNS authority from Vercel to Cloudflare on the same day. Public DNS was already correct, the Cloudflare Tunnel and Access app were healthy, and direct `curl` requests using the real AWS runtime secrets returned `200` from the signing gateway. However, `backend_pro` running in ECS still resolved the signing hostname to a stale route and received:

- `404 Not Found`
- body preview similar to: `The deployment could not be found on Vercel. DEPLOYMENT_NOT_FOUND ...`

In that state, the admin UI correctly shows the gateway as offline because `GET /api/admin/signing/health` is only reporting what `backend_pro` sees.

**When this workaround is justified**

Only implement the targeted public-DNS lookup in `apps/backend_pro/src/lib/signingGatewayClient.ts` when all of the following are true:

- The signing hostname was recently created or changed during a DNS/provider cutover.
- Public DNS (`dig`, `curl`, browser) already resolves to Cloudflare and works from an external machine.
- The on-prem server and `cloudflared` tunnel are healthy.
- Cloudflare Access service token credentials are correct in AWS Secrets Manager.
- ECS runtime calls to `SIGNING_GATEWAY_URL` still fail and logs show an old provider response or other clearly stale DNS result.

**When this workaround is not needed**

Do not add or keep this workaround just because the health check is offline. First rule out:

- missing `SIGNING_GATEWAY_URL`
- missing `SIGNING_API_KEY`
- missing `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`
- Cloudflare Access `403`
- tunnel instability / UDP buffer issues
- actual on-prem `signing-gateway` or `mtsa` outage

**Workaround**

`backend_pro` can bypass the ECS/VPC recursive resolver for signing-gateway calls only by resolving `*.truestack.my` through public DNS resolvers (for example `1.1.1.1` and `8.8.8.8`) before opening the HTTPS request. Keep the request hostname, SNI, and `Host` header unchanged so Cloudflare Access and the tunnel routing still work normally.

This is intentionally narrow:

- apply it only to signing-gateway requests, not all outbound traffic
- keep the normal hostname in `SIGNING_GATEWAY_URL`
- preserve TLS `servername` and `Host` header
- leave the rest of the application on normal system DNS

**How to confirm root cause before enabling**

1. Confirm on-prem health locally:

```bash
curl http://localhost:3100/health
```

2. Confirm the public hostname works with the real runtime secrets:

```bash
curl \
  -H "X-API-Key: $SIGNING_API_KEY" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  "https://<client-id>-sign.truestack.my/health"
```

3. Compare with what `backend_pro` sees:

```bash
curl "https://<client-api-domain>/api/admin/signing/health"
```

4. If direct public access succeeds but ECS still logs stale-provider responses (for example Vercel `DEPLOYMENT_NOT_FOUND`), the resolver path inside ECS is the problem and the targeted public-DNS workaround is appropriate.

**Operational note**

Treat this as a defensive workaround for DNS cutovers, not the default architecture. If the resolver path settles after propagation and the workaround is no longer needed, reassess whether to keep or simplify it.

---

## 12. Checklist

Use this checklist when onboarding a new client:

### Configuration
- [ ] Create `config/clients/<client-id>.yaml` with all required blocks (copy from `demo-client.yaml`)
- [ ] Create ECR repo in client's AWS account (`truekredit-pro-signing-gateway`)

### On-Prem Server (one-time, requires SSH access)
- [ ] Install Docker and enable on boot (`systemctl enable docker containerd`)
- [ ] Increase UDP buffer sizes for Cloudflare Tunnel QUIC stability (see below)
- [ ] Generate SSH key pair (`ssh-keygen -t ed25519 -f deploy_key -N ""`)
- [ ] Create `deploy` user with Docker group membership
- [ ] Install public key to `/home/deploy/.ssh/authorized_keys`
- [ ] Create `/opt/signing-stack/` directory structure (owned by `deploy`)
- [ ] Copy `docker-compose.prod.yml` → `/opt/signing-stack/docker-compose.yml`
- [ ] Copy `deploy.sh` → `/opt/signing-stack/deploy.sh` (make executable)
- [ ] Load MTSA Docker image (tarball or build from source)

### Cloudflare (via dashboard or API)
- [ ] Create tunnel: `<client-id>-onprem`
- [ ] Configure tunnel hostnames: signing API + SSH
- [ ] Create DNS CNAME records (or verify auto-created by dashboard)
- [ ] Create service token: `<client-id>-onprem-deploy` (save Client ID + Secret immediately)
- [ ] Create Access application for SSH hostname with service token policy
- [ ] Create Access application for signing API hostname with service token policy
- [ ] Verify signing API returns 403 without token and 200 with token

### GitHub Secrets
- [ ] Create GitHub environment: `pro-<client-id>`
- [ ] Set `AWS_ROLE_ARN`
- [ ] Set `ONPREM_SSH_KEY` (private key)
- [ ] Set `CF_ACCESS_CLIENT_ID`
- [ ] Set `CF_ACCESS_CLIENT_SECRET`
- [ ] Set `ONPREM_CF_TUNNEL_TOKEN`
- [ ] Set `ONPREM_MTSA_USERNAME`
- [ ] Set `ONPREM_MTSA_PASSWORD`
- [ ] Set `ONPREM_MTSA_IMAGE`
- [ ] Set `ONPREM_SIGNING_API_KEY`
- [ ] Verify all 9 secrets present: `gh secret list --env pro-<client-id>`

### AWS Secrets Manager
- [ ] Add `signing_gateway_url`, `signing_api_key`, `signing_enabled`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` to client's app secret

### First Deployment
- [ ] Start cloudflared + MTSA on server with minimal `.env` (use real tunnel token)
- [ ] Verify tunnel shows "Healthy" in Cloudflare dashboard
- [ ] Trigger first CI/CD deployment: `workflow_dispatch`, action: `full`
- [ ] Verify health endpoint with service token: `curl -H "CF-Access-Client-Id: ..." -H "CF-Access-Client-Secret: ..." https://<client-id>-sign.truestack.my/health`
- [ ] Force new ECS deployment for backend_pro to pick up signing secrets
- [ ] Verify signing health check shows "connected" in admin_pro dashboard

### Cleanup
- [ ] Delete private key from on-prem server
- [ ] Remove temporary sudo access if granted
