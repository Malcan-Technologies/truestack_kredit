# AWS configuration review — remediation guidance (internal)

**Organization:** Proficient Premium Sdn. Bhd.  
**In-scope asset:** Proficient-Premium AWS  
**Source:** Host security configuration review report (AWS), engagement approximately 24–29 April 2026; report version 1.0 released 4 May 2026 (EC-Council Global Services).  
**Benchmark referenced:** CIS Amazon Web Services Foundations Benchmark v6.0.0 Level 1  
**Purpose of this document:** Summarize observations from the report (observations table, PDF pp. 10–11) and classify each as **good to change**, **defer / keep in view**, or **change carefully** (cost or operational risk). This note favors controls that are **configuration- or process-based** and avoids recommending **additional paid AWS products** or patterns that materially increase recurring spend.

**Confidentiality:** For internal use only; align distribution with the original report’s terms.

---

## Observations summary (from report)

| No. | Check item | Status |
|-----|------------|--------|
| 1 | 2.2 Ensure security contact information is registered | Room for Refinement |
| 2 | 2.6 Eliminate use of the `root` user for administrative and daily tasks | Keep in View |
| 3 | 2.7 Ensure IAM password policy requires minimum length of 14 or greater | Room for Refinement |
| 4 | 2.8 Ensure IAM password policy prevents password reuse | Room for Refinement |
| 5 | 2.9 Ensure MFA is enabled for all IAM users that have a console password | Room for Refinement |
| 6 | 2.14 Ensure IAM users receive permissions only through groups | Room for Refinement |
| 7 | 2.15 Ensure IAM policies that allow full `*:*` administrative privileges are not attached | Room for Refinement |
| 8 | 2.16 Ensure a support role has been created to manage incidents with AWS Support | Room for Refinement |
| 9 | 2.19 Ensure IAM Access Analyzer is enabled for all regions | Room for Refinement |
| 10 | 4.1 Ensure CloudTrail is enabled in all regions | Room for Refinement |
| 11 | 4.4 Ensure server access logging is enabled on the CloudTrail S3 bucket | Room for Refinement |
| 12 | 5.2 Ensure management console sign-in without MFA is monitored | Room for Refinement — **guidance TBD (to be discussed)** |
| 13 | 5.3 Ensure usage of the `root` account is monitored | Room for Refinement — **guidance TBD (to be discussed)** |
| 14 | 5.4 Ensure IAM policy changes are monitored | Room for Refinement — **guidance TBD (to be discussed)** |
| 15 | 5.5 Ensure CloudTrail configuration changes are monitored | Room for Refinement — **guidance TBD (to be discussed)** |
| 16 | 5.8 Ensure S3 bucket policy changes are monitored | Room for Refinement — **guidance TBD (to be discussed)** |
| 17 | 5.12 Ensure changes to network gateways are monitored | Room for Refinement — **guidance TBD (to be discussed)** |
| 18 | 5.13 Ensure route table changes are monitored | Room for Refinement — **guidance TBD (to be discussed)** |
| 19 | 5.14 Ensure VPC changes are monitored | Room for Refinement — **guidance TBD (to be discussed)** |
| 20 | 5.15 Ensure AWS Organizations changes are monitored | Room for Refinement — **guidance TBD (to be discussed)** |
| 21 | 6.2 Ensure no network ACLs allow ingress from `0.0.0.0/0` to remote server administration ports | Room for Refinement |
| 22 | 6.1.1 Ensure EBS volume encryption is enabled in all regions | Room for Refinement |

---

## Per-observation guidance

### 1 — 2.2 Security contact information registered

**Assessment:** Good to change.

**Why:** Ensures AWS security advisories and account notices reach the right team; no architectural impact.

**Cost / operational note:** No additional AWS charge. Use a monitored distribution list if appropriate.

---

### 2 — 2.6 Eliminate use of `root` for administrative and daily tasks

**Assessment:** Defer or keep in view — remediate in a **phased**, controlled way (report status: Keep in View).

**Why:** The goal (no day-to-day `root`, break-glass only) is correct, but abrupt changes can lock out operations or break automation that still relies on `root`.

**Cost / operational note:** No AWS SKU cost; operational cost is migration and documentation. Prefer IAM roles/users with least privilege and a documented emergency `root` procedure.

---

### 3 — 2.7 IAM password policy: minimum length 14+

**Assessment:** Good to change.

**Why:** Raises bar against guessing and credential stuffing for console passwords.

**Cost / operational note:** No incremental AWS charge; users may need a one-time password update.

---

### 4 — 2.8 IAM password policy: prevent password reuse

**Assessment:** Good to change.

**Why:** Reduces risk from recycled passwords.

**Cost / operational note:** No incremental AWS charge.

---

### 5 — 2.9 MFA for all IAM users with a console password **

**Assessment:** Good to change.

**Why:** Strong protection for interactive console access.

**Cost / operational note:** Prefer **virtual MFA (authenticator app)** or **security keys** already owned; avoid treating **paid hardware tokens** as mandatory for baseline compliance. No extra AWS fee for standard IAM MFA methods.

---

### 6 — 2.14 Permissions only through groups

**Assessment:** Good to change.

**Why:** Easier audits, onboarding, and offboarding; fewer one-off permission attachments.

**Cost / operational note:** None beyond engineering time to remap policies.

---

### 7 — 2.15 No `*:*` administrator policies attached ***

**Assessment:** Good to change.

**Why:** Full admin attachments are high blast radius and easy to mis-scope.

**Cost / operational note:** Refactoring work only; avoid introducing **new** customer-managed KMS keys or paid governance suites solely for this item unless already required.

---

### 8 — 2.16 Support role for AWS Support

**Assessment:** Good to change.

**Why:** Allows least-privilege support collaboration without sharing long-lived credentials.

**Cost / operational note:** IAM configuration only; no added service charge for the role itself.

---

### 9 — 2.19 IAM Access Analyzer enabled for all regions

**Assessment:** Change carefully — align scope with **regions you actually use** unless policy mandates “all regions.”

**Why:** External-access visibility is valuable; CIS wording emphasizes breadth.

**Cost / operational note:** Enabling analyzers broadly can increase **analyzer-related AWS charges** depending on configuration and analyzer type. Practical approach: enable for **active regions** first, document any intentional exception for unused regions, and review current AWS pricing for Access Analyzer before expanding.

---

### 10 — 4.1 CloudTrail enabled in all regions

**Assessment:** Good to change, implemented as **one multi-region trail** (not duplicate trails per region).

**Why:** Account-wide visibility of management events supports detection and investigation.

**Cost / operational note:** **Management events:** first trail copy is typically inexpensive by AWS design; costs usually come from **S3 storage** and optional integrations. Use **S3 lifecycle** (transition/expiry) to cap storage growth. Avoid extra **paid data-event** logging unless required.

---

### 11 — 4.4 Server access logging on the CloudTrail S3 bucket

**Assessment:** Good to change with **small footprint**.

**Why:** Logs object-level access to the trail bucket (useful if someone tampers with or exfiltrates logs).

**Cost / operational note:** Additional **S3 storage** for access logs; keep a **dedicated small log bucket** with **lifecycle rules** to bound cost.

---

### 12 — 5.2 Monitor console sign-in without MFA

**Assessment:** TBD (to be discussed).

**Why:** TBD (to be discussed) — targets, channels (e.g. EventBridge, SNS, ticketing), and ownership to be agreed.

**Cost / operational note:** TBD (to be discussed) — confirm acceptable footprint (e.g. avoid paid log pipelines unless budgeted).

---

### 13 — 5.3 Monitor `root` account usage

**Assessment:** TBD (to be discussed).

**Why:** TBD (to be discussed).

**Cost / operational note:** TBD (to be discussed).

---

### 14 — 5.4 Monitor IAM policy changes

**Assessment:** TBD (to be discussed).

**Why:** TBD (to be discussed).

**Cost / operational note:** TBD (to be discussed).

---

### 15 — 5.5 Monitor CloudTrail configuration changes

**Assessment:** TBD (to be discussed).

**Why:** TBD (to be discussed).

**Cost / operational note:** TBD (to be discussed).

---

### 16 — 5.8 Monitor S3 bucket policy changes

**Assessment:** TBD (to be discussed).

**Why:** TBD (to be discussed).

**Cost / operational note:** TBD (to be discussed).

---

### 17 — 5.12 Monitor network gateway changes

**Assessment:** TBD (to be discussed).

**Why:** TBD (to be discussed).

**Cost / operational note:** TBD (to be discussed).

---

### 18 — 5.13 Monitor route table changes

**Assessment:** TBD (to be discussed).

**Why:** TBD (to be discussed).

**Cost / operational note:** TBD (to be discussed).

---

### 19 — 5.14 Monitor VPC changes

**Assessment:** TBD (to be discussed).

**Why:** TBD (to be discussed).

**Cost / operational note:** TBD (to be discussed).

---

### 20 — 5.15 Monitor AWS Organizations changes

**Assessment:** TBD (to be discussed).

**Why:** TBD (to be discussed) — confirm whether AWS Organizations is in scope; may be N/A.

**Cost / operational note:** TBD (to be discussed).

---

### 21 — 6.2 No NACL ingress `0.0.0.0/0` to remote administration ports

**Assessment:** Good to change.

**Why:** Broad NACL openings for SSH/RDP/DNS admin ports, etc., increase arbitrary scanning and lateral risk.

**Cost / operational note:** Configuration only; validate with change windows so legitimate jump paths remain supported.

---

### 22 — 6.1.1 EBS encryption enabled in all regions

**Assessment:** Good to change using **default EBS encryption** with the **AWS-managed** key for EBS unless a **pre-existing** compliance mandate requires customer-managed KMS.

**Why:** Encrypts data at rest on volumes with minimal friction for new volumes/snapshots.

**Cost / operational note:** **Default/AWS-managed encryption** avoids extra **KMS key** monthly charges. **Customer-managed CMKs** can add **KMS key** fees — do not recommend adopting those **only** to satisfy this finding unless required.

---

## Future scope (not covered here)

**PostgreSQL, application backend, and non-AWS** findings will be addressed in a separate internal note when those assessment results are available. This document covers **AWS account/configuration** observations only.
