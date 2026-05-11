# Web application security (black box) — remediation guidance (internal)

**Organization:** Proficient Premium Sdn. Bhd.  
**In-scope assets:** Public web properties assessed in the draft report (e.g. `ppsb-eloan.com.my`, `admin.ppsb-eloan.com.my`, `sign.ppsb-eloan.com.my`, `api.ppsb-eloan.com.my` per source workbook).  
**Source:** *2026 Proficient Premium Web Application Security Assessment (Black Box) Draft Report* — workbook version 1.0 (Items, Summary, and Glossary sheets). Observations attributed in-source to **EGS security team**; align final dates/versioning with the issued PDF when available.  
**Method:** Black-box assessment (non-intrusive configuration/header/TLS review as described in workbook items).  
**Purpose of this document:** Summarize workbook **findings** (severity, CVSS where provided, OWASP-aligned category), resolution status, and classify each as **good to change**, **defer / keep in view**, or **change carefully** (risk of breaking clients or apps). Favors **reverse-proxy / CDN / app-server configuration** and **process** fixes — not **new paid WAF/SaaS scanners** or **extra AWS SKUs** unless already on roadmap.

**Confidentiality:** For internal use only; align distribution with the original report’s terms.

---

## Findings summary (from workbook)

**Counts (Summary sheet):** Critical 0, High 0, Medium 2, Low 3, Info 4 — **Total 9**; all listed items **Open (Not Solved)** at workbook capture time.

| Item | Finding | Severity | Resolution (workbook) | OWASP-style mapping |
|------|---------|----------|------------------------|---------------------|
| 1 | TLS Version 1.0 Protocol Detection | Medium | Open (Not Solved) | A02 Cryptographic Failures — weak TLS |
| 2 | TLS Version 1.1 Protocol Detection | Medium | Open (Not Solved) | A02 Cryptographic Failures — weak TLS |
| 3 | Clickjacking | Low | Open (Not Solved) | A04 Insecure Design — UI deception |
| 4 | Missing Content-Security-Policy Header | Low | Open (Not Solved) | A05 Security Misconfiguration / defense in depth (XSS-related) |
| 5 | Missing X-Frame-Options Header | Low | Open (Not Solved) | A05 Security Misconfiguration — framing |
| 6 | Missing HTTP Strict Transport Security Header | Info | Open (Not Solved) | A05 Security Misconfiguration — transport enforcement |
| 7 | Missing X-Content-Type-Options Header | Info | Open (Not Solved) | A05 Security Misconfiguration — MIME sniffing |
| 8 | Information Disclosure (`robots.txt`) | Info | Open (Not Solved) | A01 Broken Access Control (if paths rely on obscurity) / WSTG info gathering |
| 9 | TLS/SSL Weak Cipher Suites (CBC) | Info | Open (Not Solved) | A02 Cryptographic Failures — legacy cipher suites |

**References / category pointers in workbook:** OWASP Cheat Sheets (Transport Layer Protection, Clickjacking, CSP, HTTP Headers, HSTS), OWASP Secure Headers project, OWASP WSTG (metafiles, weak TLS testing).

---

## Per-finding guidance

### 1 — TLS 1.0 enabled (Medium — CVSS 6.5)

**Assessment:** Good to change at **TLS termination** (load balancer, reverse proxy, or API gateway) — disable TLS 1.0 for all assessed hostnames.

**Why:** TLS 1.0 is deprecated; clients and compliance baselines expect TLS 1.2+; retaining 1.0 keeps unnecessary downgrade/crypto surface.

**Cost / operational note:** **No new products required** — configuration on infrastructure you already operate. **Cost caution:** some **legacy IoT/old browsers** may fail after removal — inventory telemetry (CloudFront/LB logs) before cutover; avoid procuring **paid “legacy TLS”** services to postpone deprecation.

---

### 2 — TLS 1.1 enabled (Medium — CVSS 6.5)

**Assessment:** Good to change alongside §1 (**disable 1.0 and 1.1**; enable **TLS 1.2 + 1.3**).

**Why:** TLS 1.1 lacks modern AEAD cipher preferences; same ecosystem sunset drivers as 1.0.

**Cost / operational note:** Same as §1 — **config-only** at the edge. Schedule joint change to reduce retest cycles.

---

### 3 — Clickjacking (Low — CVSS 3.1)

**Assessment:** Good to change using **`Content-Security-Policy: frame-ancestors`** (preferred modern control) and/or **`X-Frame-Options`** (see §5) for defense in depth.

**Why:** Without framing controls, authenticated pages can be embedded for UI-redress attacks.

**Cost / operational note:** Header-only fix at proxy; **no recurring license**. Validate legitimate **embed** integrations (rare for admin) before `DENY`.

---

### 4 — Missing Content-Security-Policy (CSP) header (Low — CVSS 3.1)

**Assessment:** Change carefully — start **Report-Only** or a **narrow** policy, then tighten.

**Why:** CSP reduces XSS blast radius and supplies a long-term control for script/style origins.

**Cost / operational note:** Tight CSP can **break inline scripts/styles** and third-party widgets — phased rollout avoids emergency rollbacks. **Avoid** buying **CSP SaaS** until team-owned reporting is insufficient; browser **Report-Only** logs are free but watch **log volume** if piped to paid SIEM.

---

### 5 — Missing `X-Frame-Options` (Low — CVSS 3.1)

**Assessment:** Good to change (`DENY` or `SAMEORIGIN` per business need).

**Why:** Backstop for older browsers alongside CSP `frame-ancestors`.

**Cost / operational note:** Single header from app or reverse proxy — **zero license cost**.

---

### 6 — Missing HTTP Strict Transport Security (HSTS) (Info — CVSS 0)

**Assessment:** Good to change once TLS is **correctly** terminated everywhere (after §1–§2, §9).

**Why:** HSTS reduces SSL-stripping/downgrade attempts for returning browsers.

**Cost / operational note:** Header-only; use conservative `max-age` ramp if **mixed-content** or **legacy HTTP** dependencies still exist to avoid locking users out — still **no paid tool** required.

---

### 7 — Missing `X-Content-Type-Options: nosniff` (Info — CVSS 0)

**Assessment:** Good to change globally on HTML/API responses where safe.

**Why:** Reduces MIME-sniffing surprises that turn uploads or static files into executable contexts.

**Cost / operational note:** Trivial header; test **download endpoints** that relied on browser sniffing (uncommon but possible).

---

### 8 — Information disclosure — `robots.txt` (Info — CVSS 0)

**Assessment:** Good to change via **content review** + ensure **real authZ** on “hidden” paths — not security-through-obscurity.

**Why:** `robots.txt` maps candidate URLs; risk is real only if sensitive areas lack effective access control.

**Cost / operational note:** Editing text files and fixing **actual** ACLs is **free**; **no scanners needed**. If marketing wants big disallow lists, weigh **operational secrecy** vs. transparency — removing entries does not replace **authn/authz hardening**.

---

### 9 — Weak TLS cipher suites — CBC modes (Info — CVSS 0)

**Assessment:** Good to change — prefer **AEAD** suites (AES-GCM, ChaCha20-Poly1305) on TLS 1.2/1.3 policy.

**Why:** CBC suites are legacy; modern baselines favor AEAD to reduce theoretical padding/oracle surface.

**Cost / operational note:** Cipher policy is **free** at LB/proxy; **cost caution:** exotic clients may need exceptions — measure handshake failures after change; avoid purchasing **premium “cipher management”** products for a standard openssl/LB update.

---

## Scope / workbook limitations

- **Draft workbook:** Resolution status, severities, and counts are **as captured** in the xlsx (`Open (Not Solved)` for all nine items). Update this note when the final PDF is released.
- **Black box:** Items are **perimeter/header/crypto posture**; deeper OWASP categories (auth, business logic, injection) may require **authenticated/grey-box** tests **not represented** in this workbook extract.
- **Glossary sheet:** Severity/resolution definitions in workbook match rows above (Critical/High/Medium/Low/Info; Closed Solved/Justified vs Open Not Solved).
