# Cloudflare + AWS setup reference (Pro external clients)

Single-page reference for **dedicated** Pro stacks that use **Cloudflare DNS** (and optionally **Tunnel / Access** for signing). Complements `docs/pro_client_deployment_guide.md`.

---

## 1. Domain alignment (avoid ACM hangs)

Terraform, ACM, Cloudflare, and `config/clients/<client>.yaml` must describe the **same** public hostnames.

| Source | What to keep in sync |
|--------|----------------------|
| `terraform/pro/clients/<id>/*.tfvars` | `admin_domain`, `api_domain`, `borrower_domain` |
| `config/clients/<id>.yaml` | `domains.admin`, `domains.api`, `domains.borrower` |
| Cloudflare | **Zone must be authoritative** for those names (e.g. `pinjocep.com.my` cannot validate `*.loans.pinjocep.com`) |

**Failure mode:** ACM stays **Pending validation** and `aws_acm_certificate_validation` runs until timeout because validation CNAMEs are missing, wrong, or published in the **wrong DNS zone**.

---

## 2. ACM (AWS Certificate Manager)

1. Run Terraform (or inspect ACM console) in the **same region** as the stack (e.g. `ap-southeast-5`).
2. With `create_dns_records = false`, Terraform does **not** create validation records. You must add them at Cloudflare:
   - **DNS** → **Add record** → **Type CNAME** for each row ACM shows.
   - **Name / Target:** copy from ACM (or `terraform output acm_certificate_validation_records`).
   - **Proxy:** **DNS only** (gray cloud) for `_acm-challenge` / validation CNAMEs.
3. Wait until **all** domains show **Success** / certificate **Issued**.
4. **Apex domains** (`borrower` = root): validation is still a CNAME on the **root label**—ensure no conflicting apex record blocks it (see §4).

---

## 3. Application DNS (traffic to the ALB)

After the certificate is **Issued**, point public hostnames at the load balancer:

- **Target for all app names** (admin, api, borrower apex or chosen name):  
  `terraform output alb_dns_name` (ALB DNS hostname).

Typical Cloudflare records:

- `admin` → **CNAME** → ALB DNS (proxied or DNS-only per your policy).
- `api` → **CNAME** → ALB DNS.
- `@` (apex) → **CNAME** → ALB DNS **only if** there is no existing **A/AAAA** for that name (remove or replace the conflicting record).

If you use **orange cloud**, set SSL/TLS to **Full (strict)** so Cloudflare trusts the origin (ALB) certificate.

---

## 4. Apex / CNAME conflicts in Cloudflare

Cloudflare allows one record set per name. **You cannot** add `CNAME @` while an **`A` for the same apex** exists (e.g. old hosting IP). **Delete or change** the apex **A** first, then add **CNAME @** to the ALB.

Also review **`www`** and **`*`** (wildcard) so traffic matches intent after cutover.

---

## 5. GitHub Actions → AWS (OIDC)

### 5.1 One-time in the **client AWS account**

1. **OIDC provider** (if missing):  
   URL `https://token.actions.githubusercontent.com`, audience **`sts.amazonaws.com`** (shows as client ID list in IAM).
2. **IAM role** for deploy (e.g. `github-actions-pro-<client>`):
   - **Trust policy** must allow **`sts:AssumeRoleWithWebIdentity`** from that OIDC provider.
   - **`StringEquals`:** `token.actions.githubusercontent.com:aud` = `sts.amazonaws.com`.
   - **`StringLike` / `StringEquals` on `sub`:** must match how GitHub identifies the workflow.

### 5.2 Critical: `sub` claim and GitHub Environments

`deploy-pro.yml` uses:

```yaml
environment: ${{ needs.load-config.outputs.github_environment }}
```

So the OIDC **`sub`** is **environment-scoped**, e.g.:

`repo:<ORG>/<REPO>:environment:pro-pinjocep`

A trust policy that only allows `repo:<ORG>/<REPO>:ref:refs/heads/main` will fail with:

**`Not authorized to perform sts:AssumeRoleWithWebIdentity`**

**Fix:** Add the environment line to the trust condition, e.g.:

`repo:Malcan-Technologies/truestack_kredit:environment:pro-pinjocep`

(Add one entry per external client environment, or use a controlled `StringLike` pattern.)

### 5.3 GitHub repository

- **Settings → Environments →** `<github_environment>` from client YAML (e.g. `pro-pinjocep`).
- Secret **`AWS_ROLE_ARN`** = full ARN of the OIDC role above.

---

## 6. Optional: Cloudflare API token (automation)

If Terraform or scripts manage Cloudflare (not used by default client stack when `create_dns_records = false`), create an API token with at least:

- **Zone → DNS → Read/Edit**
- For **Tunnel / Access** automation: **Account → Cloudflare Tunnel → Edit**, **Zero Trust / Access** as needed.

Scope **Zone** to the client’s zone when possible (not “all zones”) for least privilege.

---

## 7. Signing stack: Tunnel + Access + secrets

For signing-enabled clients (`docs/pro_client_deployment_guide.md` §10):

1. **Tunnel** + public hostnames (e.g. `sign.<domain>`, `ssh-sign.<domain>`).
2. **Cloudflare Access** with **Service token**; policies allow **Service Auth** for that token.
3. **GitHub Environment:** `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `ONPREM_CF_TUNNEL_TOKEN` as required by workflows.
4. **AWS Secrets Manager** (runtime): same **`CF_ACCESS_CLIENT_ID`** / **`CF_ACCESS_CLIENT_SECRET`** so `backend_pro` can call the signing API (see your app secret keys).

These are **separate** from ALB DNS for admin/api/borrower.

---

## 8. Quick “it failed” checklist

| Symptom | Likely cause |
|--------|----------------|
| Terraform stuck on `aws_acm_certificate_validation` | Validation CNAMEs missing / wrong zone / apex conflict |
| `AssumeRoleWithWebIdentity` denied | Trust policy **`sub`** missing `environment:<env>` |
| Cloudflare “record already exists” | Apex **A** vs **CNAME @** conflict |
| TLS errors behind orange cloud | SSL mode not **Full (strict)** |

---

## 9. Canonical checklist elsewhere

- Full external onboarding: **`docs/pro_client_deployment_guide.md`** (Terraform networking, checklist §3–5, Cloudflare §10).
