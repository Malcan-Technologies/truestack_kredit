# Proficient Premium — applied remediation status

**Scope:** **Proficient Premium Sdn. Bhd. AWS account and properties only** (not Pinjocep or other clients).  
**Purpose:** Track what is **Applied**, **Reverted**, **Guided / unverified**, or **TBD** as of the last update below.  
**Profile / region (typical):** AWS CLI `Proficient Premium`, `ap-southeast-5`.

**Related docs (guidance, not live state):**

- [AWS configuration review](proficient-premium-aws-configuration-review.md)
- [Web application black box review](proficient-premium-web-application-black-box-review.md)
- PostgreSQL / RDS CIS notes (if maintained elsewhere in the repo)

**Last updated:** 2026-05-12 (refresh after any prod change).

---

## Legend

| Label | Meaning |
|-------|--------|
| **Applied** | Done and **still intended to be** in effect; re-check after Terraform or console changes. |
| **Reverted** | Was applied, then **rolled back**; not current. |
| **Guided only** | Recommended in chat/docs; **not** confirmed applied from here. |
| **TBD** | Not done in tracked work. |
| **External** | Cloudflare, app repo, or DNS — verify outside AWS IAM/RDS/EC2 consoles. |

---

## AWS (CIS-style — account `872891100129` / Proficient-Premium)

| # | Theme | Status | Notes |
|---|--------|--------|--------|
| 1 | Security contact (2.2) | **Guided only** | Account **Alternate contacts → Security** — confirm in console. |
| 2 | Root / daily use (2.6) | **Guided only** | Process / IAM design — verify. |
| 3–4 | IAM password policy (2.7–2.8) | **Applied** | **Account-level** policy updated via CLI (min length 14, reuse prevention, complexity; no expiry set in that run). Re-validate if IAM/account is Terraform-managed. |
| 5 | MFA for console users (2.9) | **Guided only** | Enable virtual MFA per user — verify in IAM. |
| 6 | Permissions via groups (2.14) | **Guided only** | Verify no direct user policies remain. |
| 7 | No `*:*` admin policies (2.15) | **Guided only** | Audit IAM attachments. |
| 8 | AWS Support access role (2.16) | **Applied** | Role **`AWSSupportAccessRole`** with **`AWSSupportAccess`** (CLI). |
| 9–11 | Access Analyzer / CloudTrail / S3 logging | **TBD** | Not applied in tracked work. |
| 12–20 | EventBridge / monitoring | **TBD** | Internal AWS doc may mark guidance “to be discussed”; confirm no regression if you add rules later. |
| 21 | NACL hardening (6.2) | **Reverted** | Both **default NACLs** touched in this account were restored to **inbound rule 100 = allow all** from `0.0.0.0/0` (operational rollback). **Not** CIS-tight today. |
| 22 | EBS default encryption (6.1.1) | **TBD** | Not applied in tracked work. |

**NACL IDs reverted (reference):** `acl-0c3074a8dc9ea76de` (e.g. `vpc-0a21d89b029eec4dc`), `acl-01daa88a8c0caa995` (e.g. `vpc-0de2d1079ae850837`).

---

## PostgreSQL / RDS (Proficient Premium)

| Theme | Status | Notes |
|--------|--------|--------|
| pgAudit + custom DB parameter group (CIS §3.2 / internal #8) | **Reverted** | Instance **`truekredit-proficient-premium`**: back to **`default.postgres16`**, **`pgaudit`** removed from **`shared_preload_libraries`** after reboot. Optional cleanup: `DROP EXTENSION IF EXISTS pgaudit;` in each DB where it was created. |
| Other PostgreSQL CIS items | **TBD** | Logging, patches, RLS, etc. — track as separate tasks. |

---

## Web / black box (`ppsb-eloan.com.my` stack)

Aligned to [web black-box review](proficient-premium-web-application-black-box-review.md) finding numbers. Headers below are **Cloudflare → Rules → Transform Rules → modify response header** unless noted.

| # | Finding | Status | Notes |
|---|---------|--------|--------|
| 1 | TLS 1.0 | **Applied** | **Cloudflare** minimum TLS raised to **1.2+** (operator-confirmed). **ALB** `truekredit-proficient-premium-al` HTTPS uses **`ELBSecurityPolicy-TLS13-1-2-2021-06`** (TLS 1.2/1.3 only). Rescan public hostnames to close workbook. |
| 2 | TLS 1.1 | **Applied** | Addressed with same Cloudflare minimum TLS + ALB policy as §1. |
| 3 | Clickjacking | **Applied** | **`Content-Security-Policy: frame-ancestors 'none'`** (transform rule). Prefer **Set static** so origin duplicates do not stack. |
| 4 | Missing CSP header | **Applied (framing)** | Same header/value as §3 — satisfies presence of CSP for framing; **broader** CSP (`default-src`, `script-src`, `connect-src`, …) remains **optional / phased** per review doc if you want full XSS-oriented policy. |
| 5 | Missing `X-Frame-Options` | **Applied** | **`DENY`** via transform rule (use **Set static**). |
| 6 | HSTS | **Applied** | **`Strict-Transport-Security`** with long `max-age` + **`includeSubDomains`** observed on responses (e.g. admin). Spot-check **api/sign/root** match before audit sign-off. |
| 7 | `X-Content-Type-Options` | **Applied** | **`nosniff`** via transform rule (**Set static**). |
| 8 | `robots.txt` disclosure | **Applied** | **Admin app (`@kredit/admin`):** Edge middleware requires Better Auth session cookie for `/dashboard`; **`dynamic = force-dynamic`** for dashboard segment; **`Cache-Control: private, no-store`** on gated responses; login **`returnTo`** (safe paths only). **Process:** paths listed in `robots.txt` still require real **authZ** — keep content review as needed. |
| 9 | Weak CBC ciphers | **Applied** | **ALB** policy **`ELBSecurityPolicy-TLS13-1-2-2021-06`**: TLS **1.2 + 1.3**; **no CBC** cipher suites in policy (CLI `describe-ssl-policies`, 2026-05-12). With **Cloudflare min TLS 1.2+**, client path is modern; formal **rescan** to match workbook. |
| — | Referrer policy | **Applied** | **`Referrer-Policy: strict-origin-when-cross-origin`** (not one of the nine workbook rows; optional hardening). |

---

## Changelog (edit when you change production)

| Date | Change |
|------|--------|
| 2026-05-12 | **Web §1–§2:** Cloudflare **minimum TLS 1.2+** (confirmed). **Web §9:** ALB **`ELBSecurityPolicy-TLS13-1-2-2021-06`** verified (TLS 1.2/1.3, no CBC in policy). **Web §6:** HSTS applied / observed on admin; confirm all subdomains. **Web §8:** Admin **Next.js** — session cookie gate + no-store/dynamic for `/dashboard`; safe **`returnTo`** on login. |
| 2026-05-11 | **Web black-box §3–§5, §7:** Cloudflare response header transform — `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. |
| 2026-05-11 | Initial status file: password policy + **AWSSupportAccessRole** **Applied**; **NACL #21** and **RDS pgAudit** **Reverted**; remainder **Guided/TBD/External**. |

---

## Operational notes

1. **Terraform drift:** Manual or CLI changes may not match `terraform/pro/clients/proficient-premium/`. Before `apply`, reconcile or codify.  
2. **Evidence:** For audits, attach CLI output or screenshots when you move an item from **TBD** to **Applied**.
