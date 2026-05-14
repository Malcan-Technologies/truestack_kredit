# Cloudflare + AWS setup reference (Pro external clients)

Single-page reference for **dedicated** Pro stacks that use **Cloudflare DNS** (and optionally **Tunnel / Access** for signing). Complements `docs/pro_client_deployment_guide.md`.

**Use this doc in Cursor** when onboarding a new external client, debugging ACM/GitHub OIDC, or Cloudflare cutover—search “symptom” in **§8**, or jump to **§9** (two CNAME types), **§10** (state/profile).

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
| `terraform output` / `plan` → **S3 403 Forbidden** on state bucket | Wrong **`AWS_PROFILE`** (not the client account that owns the bucket) |
| `Error acquiring the state lock` | Another `apply`/`plan` running, or crashed run—**`terraform force-unlock <id>`** only after confirming nothing else holds the lock |

---

## 9. Two kinds of Cloudflare CNAMEs (do not mix up)

| Kind | Purpose | Names | Target | Proxy |
|------|---------|-------|--------|--------|
| **ACM validation** | Prove domain ownership to AWS | `_<hash>.api…`, `_<hash>.admin…`, `_<hash>.` apex | `*.acm-validations.aws` from ACM | **DNS only** |
| **Application traffic** | Send users to the stack | `admin`, `api`, `@` (if borrower is apex) | **`alb_dns_name`** from `terraform output` | Your choice (if proxied → **Full (strict)**) |

You need **both** at different stages: validation first, then (separately) ALB CNAMEs for `admin` / `api` / `@`.

**Timing:** After DNS is correct, ACM often validates in **~2–15 minutes** (sometimes longer); Terraform’s `aws_acm_certificate_validation` timeout can be up to **~45m**.

---

## 10. Terraform state: bootstrap + correct AWS profile

### 10.1 New client AWS account

Before first `terraform init` in `terraform/pro/clients/<client>/`, that account needs:

- **S3 bucket** for state (e.g. `truestack-terraform-state-<account_id>`), **versioning + encryption**, private ACL.
- **DynamoDB** table for locks (e.g. `truestack-terraform-locks`, partition key **`LockID`** String, on-demand).

Without these, `init` fails with **NoSuchBucket** or lock errors.

### 10.2 One stack = one account = one profile

- `backend.tf` embeds the **state bucket name** (includes **account id**).
- Always run: **`AWS_PROFILE=<client_profile> terraform init|plan|apply|output`** for that folder.

**Common mistake:** Running `apply` with **`pinjocep`** credentials while using **`danacredit.tfvars`** creates resources in the **wrong account** and/or cannot write state. **Never mix profile and client folder.**

If `terraform output` returns **403** on `HeadObject` for the state key, you are **not** using credentials allowed on that bucket.

### 10.3 State lock

If a run was aborted and the next command says **state lock** exists:

1. Confirm no other Terraform or CI is using that state.
2. `terraform force-unlock <Lock ID from error>` from the same directory (with correct profile).

---

## 11. After `terraform apply` succeeds

1. **`terraform output alb_dns_name`** — use for Cloudflare **app** CNAMEs (with correct `AWS_PROFILE`).
2. **`terraform output app_secret_arn`** — copy the **full ARN** into **`config/clients/<client>.yaml`** → `secrets.app_secrets_arn` (include any random suffix Secrets Manager shows).
3. **ECS:** New services may start with **`desired_count = 0`** until **Deploy Pro** (or similar) pushes images and scales tasks—expect “no tasks” until deploy.
4. **GitHub Environment** (e.g. `pro-danacredit`): set **`AWS_ROLE_ARN`**; OIDC trust must allow **`environment:<that env>`** (§5.2).
5. **Git tags / releases** for borrower vs platform—see **§12**.
6. **DB seed (Pro):** default seeded owner password is **`Demo@123`** unless changed—see `apps/backend_pro/prisma/seed.prod.ts`; email comes from `pro_tenant.seed_owner_email` / workflow env.

---

## 12. Git tags: borrower vs platform (`deploy-pro.yml`)

Workflow reads **`borrower_app`** and version pins from **`config/clients/<id>.yaml`**.

- **Platform** (admin + backend): Git ref **`refs/tags/pro-platform-v<platform_release>`** (e.g. `pro-platform-v1.1.1`).
- **Borrower:** If **`borrower_release`** equals **`platform_release`**, borrower uses the **same** platform tag. If they **differ**, borrower needs its own tag:

  **`pro-borrower-<borrower_app>-v<borrower_release>`**

  Example: `borrower_app: Danacredit`, `borrower_release: 1.1.4` → **`pro-borrower-Danacredit-v1.1.4`**.

The middle segment must match the **`borrower_app`** string and the folder under **`apps/borrower_pro/<BorrowerApp>`** (case-sensitive per repo convention).

---

## 13. Quick per-client DNS order (memory aid)

1. **ACM validation** CNAMEs in the **correct** Cloudflare zone → wait **Issued** in ACM (same region as `aws_region`).
2. **Terraform apply** through **`aws_acm_certificate_validation`** and HTTPS listener.
3. **App** CNAMEs: `admin`, `api`, `@` (if apex) → **`alb_dns_name`**; remove conflicting apex **A** first.
4. **www** / **\*** — align or redirect so users don’t hit old IP by mistake.

---

## 14. Canonical checklist elsewhere

- Full external onboarding: **`docs/pro_client_deployment_guide.md`** (Terraform networking, checklist §3–5, Cloudflare §10).
