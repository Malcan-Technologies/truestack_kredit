# Pro Client Infrastructure Setup Runbook

Quick-reference for provisioning a **new external Pro client** end-to-end.
Covers AWS OIDC, Cloudflare (tunnel + Access), GitHub secrets, and on-prem verification.

> **Reference client:** `danacredit` (account `806169616799`, zone `danacredit.my`).
> Adapt names/IDs for each new client using `config/clients/<client_id>.yaml`.

---

## 1. AWS — GitHub Actions OIDC Role

### 1.1 Add the OIDC identity provider (once per account)

- IAM → **Identity providers** → **Add provider**
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

Skip if the provider already exists in this account.

### 1.2 Create the deploy role

- IAM → **Roles** → **Create role** → Web identity
- Identity provider: `token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`
- GitHub organization: your org (e.g. `Malcan-Technologies`)
- Repository: repo name (e.g. `truestack_kredit`)
- Branch: `*` (or `main` for stricter control)

### 1.3 Attach permissions

For a dedicated client account, attach:

- **`PowerUserAccess`** (AWS managed)
- **`IAMFullAccess`** (AWS managed) — needed for Terraform to manage ECS task roles

### 1.4 Name and description

| Field | Pattern |
|-------|---------|
| Role name | `github-actions-pro-<client_id>` |
| Description | `GitHub Actions OIDC for <org>/<repo> (pro-<client_id> env)` |

Example: `github-actions-pro-danacredit`

### 1.5 Copy ARN → GitHub

Copy the role ARN (e.g. `arn:aws:iam::806169616799:role/github-actions-pro-danacredit`).

```bash
gh secret set AWS_ROLE_ARN --env pro-<client_id> --repo <org>/<repo>
# Paste the ARN as the value
```

---

## 2. Cloudflare — API Token

Profile → **API Tokens** → **Create Custom Token**

| Permission | Level |
|-----------|-------|
| Zone → DNS → Edit | ✓ |
| Zone → DNS → Read | ✓ |
| Account → Cloudflare Tunnel → Edit | ✓ |
| Account → Zero Trust → Edit | ✓ |
| Account → Access: Apps and Policies → Edit | ✓ |

- Token name: `<client_id>` (e.g. `Danacredit`)
- Account/Zone resources: scope to this client's account and zones
- Store the token in a password manager (not in GitHub unless a workflow uses it)

---

## 3. Cloudflare — Tunnel

### 3.1 Create tunnel

Zero Trust → **Networks** → **Tunnels** → **Create a tunnel** (Cloudflared type)

- Tunnel name: match `signing.tunnel_name` from client YAML (e.g. `danacredit-onprem`)

### 3.2 Copy the tunnel token

On the **Install and run connectors** step, copy the long token from the install command (`--token <TOKEN>`).

Store it:

```bash
printf '%s' '<TOKEN>' | gh secret set ONPREM_CF_TUNNEL_TOKEN --env pro-<client_id> --repo <org>/<repo>
```

Also goes into on-prem `/opt/signing-stack/.env` as `CF_TUNNEL_TOKEN`.

### 3.3 Configure public hostnames (routes)

Add two routes on the tunnel:

| Subdomain | Domain | Path | Service Type | Service URL |
|-----------|--------|------|--------------|-------------|
| `sign` | `<client_domain>` | *(empty)* | HTTP | `http://signing-gateway:3100` |
| `ssh-sign` | `<client_domain>` | *(empty)* | SSH | `ssh://host.docker.internal:22` |

**Important:**
- Path must be **empty** (not `^/blog` or anything else) — all paths need to reach the gateway
- SSH target must be `host.docker.internal:22` (not `localhost:22`) because `cloudflared` runs in Docker
- DNS CNAMEs are usually auto-created by Cloudflare when you save the routes

---

## 4. Cloudflare — Access Service Token

Zero Trust → **Access controls** → **Service credentials** → **Service Tokens** → **Create Service Token**

- Name: `<client_id>-onprem-deploy`
- Duration: Non-expiring (rotate manually)
- **Copy Client ID and Client Secret immediately** (secret shown once)

Store in **GitHub**:

```bash
printf '%s' '<CLIENT_ID>' | gh secret set CF_ACCESS_CLIENT_ID --env pro-<client_id> --repo <org>/<repo>
printf '%s' '<CLIENT_SECRET>' | gh secret set CF_ACCESS_CLIENT_SECRET --env pro-<client_id> --repo <org>/<repo>
```

Store in **AWS Secrets Manager** (merge into existing app secret JSON):

```python
# Use the danacredit profile or equivalent
python3 <<'PY'
import json, subprocess
region, sid, profile = "ap-southeast-5", "truekredit-<client_id>", "<profile>"
r = subprocess.run(
    ["aws", "secretsmanager", "get-secret-value", "--profile", profile,
     "--region", region, "--secret-id", sid, "--query", "SecretString", "--output", "text"],
    check=True, capture_output=True, text=True)
d = json.loads(r.stdout)
d["CF_ACCESS_CLIENT_ID"] = "<CLIENT_ID>"
d["CF_ACCESS_CLIENT_SECRET"] = "<CLIENT_SECRET>"
subprocess.run(
    ["aws", "secretsmanager", "put-secret-value", "--profile", profile,
     "--region", region, "--secret-id", sid, "--secret-string", json.dumps(d)],
    check=True)
print("Done")
PY
```

---

## 5. Cloudflare — Access Applications

Create two self-hosted Access apps (Zero Trust → Access → Applications):

| Application domain | Type | Policy |
|-------------------|------|--------|
| `sign.<domain>` (gateway hostname) | Self-hosted | Service Auth → Any valid service token |
| `ssh-sign.<domain>` (SSH hostname) | Self-hosted (SSH) | Service Auth → Any valid service token |

---

## 6. GitHub Environment — All Secrets Summary

Environment name: `pro-<client_id>` (matches `aws.github_environment` in client YAML)

| Secret | Source |
|--------|--------|
| `AWS_ROLE_ARN` | IAM role ARN from step 1 |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access service token |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service token |
| `ONPREM_CF_TUNNEL_TOKEN` | Cloudflare tunnel connector token |
| `ONPREM_SSH_KEY` | Generated SSH key pair (private key) |
| `ONPREM_SIGNING_API_KEY` | `openssl rand -base64 32 \| tr -d '=' \| tr '+/' '-_'` |
| `ONPREM_MTSA_USERNAME` | From Trustgate |
| `ONPREM_MTSA_PASSWORD` | From Trustgate |
| `ONPREM_SIGNING_GATEWAY_PUBLIC_IP` | `curl -4 icanhazip.com` from on-prem |

---

## 7. AWS Secrets Manager — signing keys

Ensure the app secret JSON (`truekredit-<client_id>`) contains:

```json
{
  "signing_enabled": "true",
  "signing_gateway_url": "https://sign.<domain>",
  "signing_api_key": "<same as ONPREM_SIGNING_API_KEY>",
  "CF_ACCESS_CLIENT_ID": "<service token client id>",
  "CF_ACCESS_CLIENT_SECRET": "<service token client secret>"
}
```

After updating, **force ECS rollout** so tasks pick up new values:

```bash
aws ecs update-service --profile <profile> --region <region> \
  --cluster truekredit-<client_id> --service truekredit-<client_id>-backend \
  --force-new-deployment
```

---

## 8. On-Prem Server Verification

### 8.1 Containers running

```bash
sudo docker ps
# Expect: signing-gateway, mtsa (healthy), cloudflared
```

### 8.2 Local health

```bash
curl -sf http://127.0.0.1:3100/health
# Expect: {"status":"healthy","services":{"mtsa":"connected"},...}
```

### 8.3 Tunnel connectivity (from inside cloudflared's network)

```bash
sudo docker run --rm --network container:cloudflared curlimages/curl:8.5.0 \
  -sf http://signing-gateway:3100/health
```

### 8.4 Public endpoint

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://sign.<domain>/health
# Expect: 200
```

With Access headers:

```bash
curl -sS \
  -H "CF-Access-Client-Id: <ID>" \
  -H "CF-Access-Client-Secret: <SECRET>" \
  https://sign.<domain>/health
# Expect: 200 + JSON
```

---

## 9. Troubleshooting

### Admin shows "Offline" but on-prem curl returns 200

**Cause:** `backend_pro` (ECS) resolves `sign.<domain>` differently from on-prem.

**Check:** Does a **private Route 53 hosted zone** for `<domain>` exist and is it associated with the ECS VPC? If so, it may shadow the public Cloudflare DNS.

**Fix options:**
1. Remove `sign` record from the private hosted zone (let VPC use public DNS for that name)
2. Or extend `shouldUsePublicDns()` in `signingGatewayClient.ts` to cover the client domain

### 502 Bad Gateway

**Cause:** `cloudflared` cannot reach the origin service.

**Checks:**
1. Is `cloudflared` running? (`docker ps --filter name=cloudflared`)
2. Is `signing-gateway` on the same Docker network? (should be in same Compose project)
3. Does the tunnel route have an empty path (not `^/blog`)?
4. Is the service URL correct (`http://signing-gateway:3100`, not `localhost`)?

### ECR 403 on manual pull

**Cause:** `deploy` user has no AWS credentials.

**Fix:** Use CI deploy (recommended) or configure `aws configure` for `deploy` with ECR-read-only credentials, then `aws ecr get-login-password | docker login` before pulling.

### cloudflared UDP buffer warning

Non-critical but can cause intermittent QUIC issues. On the host:

```bash
sudo sysctl -w net.core.rmem_max=7500000
sudo sysctl -w net.core.wmem_max=7500000
# Persist in /etc/sysctl.conf
```

---

## 10. Order of Operations (Quick Reference)

1. Create AWS OIDC role → copy ARN
2. Create Cloudflare API token (for automation)
3. Create Cloudflare tunnel → copy connector token
4. Configure tunnel public hostnames (signing + SSH)
5. Create Cloudflare Access service token → copy ID + secret
6. Create Access applications on both hostnames
7. Set all GitHub Environment secrets (`pro-<client_id>`)
8. Update AWS Secrets Manager with signing keys + CF Access pair
9. Force ECS backend rollout
10. On-prem: ensure `.env` has `CF_TUNNEL_TOKEN`, start all containers
11. Verify: local health → tunnel connectivity → public endpoint → admin UI shows "Online"
