# Pro On-Prem PKI Signing Recommendations

## Purpose

This document recommends a target architecture for **Pro-only, non-SaaS** digital signing in `truestack_kredit`, based on:

- the current `truestack_kredit` architecture direction for isolated Pro clients
- the previous `creditxpress_aws` implementation
- the requirement to remove `DocuSeal` and go **directly from generated agreement -> PKI signing via MTSA/Trustgate**

This is intended to complement `docs/architecture_plan.md`, not replace it.

---

## Executive Summary

The best target architecture is:

1. Keep **agreement generation in AWS** inside `truestack_kredit`.
2. Introduce a **thin on-prem Signing Gateway** per client.
3. Keep **MTSA** local to that on-prem server and **never expose MTSA directly** to the internet.
4. Remove `DocuSeal` entirely from the new flow.
5. Use **Cloudflare Tunnel** as the default connectivity layer between AWS and the client on-prem server.
6. Treat **AWS as the workflow/control plane** and **on-prem as the signing/document plane**.
7. Store the canonical signed/original artifacts **on-prem first**, then replicate them to **S3 as an off-site backup/restore copy**.
8. Serve documents **from the on-prem server**, using short-lived signed access tokens.

This is the easiest architecture to duplicate across clients while still being maintainable, auditable, and resilient.

---

## What We Learned From `creditxpress_aws`

## What Worked

- Keeping **MTSA on-prem** is sensible when the PKI/CA integration is operationally tied to the client environment.
- Using an **on-prem bridge service** between the product and MTSA is the right pattern.
- Using **Cloudflare Tunnel** to avoid inbound firewall changes is operationally much easier than traditional VPN rollout.
- Keeping **signed PDFs on local disk** is aligned with the client expectation that documents live on their own server.
- Having **some backup and restore discipline** on the on-prem box is necessary.

## What Created Complexity

- `DocuSeal` added an extra system, extra state, extra templates, extra webhooks, and extra failure points.
- The old flow had too many moving parts:
  - cloud backend state
  - DocuSeal state
  - on-prem orchestrator state
  - MTSA state
- Signature coordinates and signer roles became coupled to DocuSeal template details.
- The system ended up with **split storage responsibilities**:
  - some files in local volumes
  - some files in S3
  - some metadata only in the orchestrator database
- Some success paths depended on multiple network hops, which increases the chance of silent desync.
- Raw MTSA and DocuSeal-related endpoints were too exposed conceptually, even if protected.

## Main Lesson

The old stack proved that **on-prem MTSA + cloud product** is workable, but it also proved that the product should not depend on a third orchestration layer if `truestack_kredit` already owns agreement generation.

The new design should therefore be:

- **fewer components**
- **clearer source-of-truth boundaries**
- **one narrow on-prem API**
- **no DocuSeal**
- **no duplicate workflow engine**

---

## Recommended Target Architecture

## Design Principle

Split responsibilities like this:

- **AWS / `backend_pro`**: business workflow, loan status, user auth, agreement generation, authorization, audit trail, backup ticket issuance, and download authorization
- **On-Prem Signing Gateway**: document intake, certificate checks, certificate enrollment through MTSA, signing, local artifact storage, artifact restore, and artifact serving
- **MTSA / Trustgate**: certificate issuance, OTP/PIN verification, and PKI PDF signing
- **S3**: off-site backup and restore source, not the primary serving origin

## High-Level Diagram

```text
Borrower/Admin UI
        |
        v
   Truestack Pro Apps (AWS)
   - admin_pro
   - backend_pro
   - borrower_pro/<client>
        |
        | server-to-server over HTTPS
        v
   Cloudflare Tunnel
        |
        v
   On-Prem Signing Gateway
   - local metadata DB
   - local document store
   - backup sync worker
        |
        +--> MTSA (internal only)
        |
        +--> S3 backup/restore
```

---

## Recommended Components

## 1. AWS Control Plane

Use the existing Pro stack as the control plane.

Responsibilities:

- generate the final Jadual J / Jadual K PDF
- keep loan/signing workflow state
- keep user/session/auth state
- decide who is allowed to sign and download
- create sign intents and idempotency keys
- issue backup upload/download tickets for S3
- receive completion callbacks from on-prem
- run reconciliation jobs for pending operations

The AWS side should **not**:

- talk to Trustgate directly
- store the primary signed artifact as the serving copy
- try to render or host a DocuSeal-like signing experience

## 2. On-Prem Signing Gateway

This replaces both the DocuSeal dependency and most of the old "orchestrator" complexity.

Responsibilities:

- accept newly generated agreement PDFs from AWS
- store original and signed versions locally
- keep a local metadata record for every artifact and sign operation
- call MTSA for:
  - certificate lookup
  - enrollment
  - OTP request
  - PIN validation if needed
  - PDF signing
- publish a narrow API back to AWS
- serve signed files directly from local disk
- replicate artifacts to S3
- restore missing artifacts from S3 if needed

The Signing Gateway should be intentionally narrow. It should not become a second copy of the loan platform.

## 3. MTSA

Keep MTSA exactly where it belongs:

- on the client's on-prem server
- only reachable on the internal Docker network / localhost network
- never directly exposed through Cloudflare

### 4. Local Metadata Store

The on-prem server should keep a small local database for signing operations and file inventory.

Recommended technology: **SQLite**.

SQLite is the right default because:

- it eliminates the need for a separate Postgres container (which the old system required)
- it is trivially backed up (copy the file)
- it is fast enough for the expected volume (one client per server)
- it avoids extra container dependencies and port management
- it can be replaced with Postgres later if a client genuinely needs it

Suggested scope:

- document catalog
- signer/certificate cache
- sign operation log
- artifact versions
- S3 backup status
- restore attempts
- audit events

This is much easier to reason about than relying on filesystem conventions alone.

## 5. Local Artifact Store

Store the canonical artifacts on the on-prem server.

At minimum:

- original agreement PDF
- signed agreement PDF
- certificate evidence / MTSA result payload summary
- optional stamp certificate / stamped version if relevant later

Recommended storage layout:

```text
/var/lib/truestack-signing/
  documents/
    <loan-or-agreement-id>/
      original/
      signed/
      certificates/
      metadata/
```

The exact folder layout can vary, but the key point is that the **document record in the local DB must know the path, hash, version, and backup state**.

---

## Remove DocuSeal Completely

This is the right architectural decision.

Reasons:

- `truestack_kredit` already generates the agreement itself.
- The new legal action is **PKI signing**, not "signature capture plus later orchestration".
- Without DocuSeal, there is no:
  - template sync problem
  - webhook forwarding problem
  - drawn signature image dependency
  - document retrieval from a third system
  - extra per-client DocuSeal deployment burden

## What To Use Instead Of DocuSeal Fields

Do not recreate DocuSeal's field model.

Instead, when the agreement PDF is generated in AWS, attach a **signature plan** that tells the Signing Gateway where each signatory's visible PKI signature should be applied.

That signature plan should include:

- `template_version`
- `document_type`
- `signatory_role`
- `page`
- `x`, `y`, `width`, `height`
- optional appearance label rules

This makes signature placement deterministic and controlled by your own agreement generator, not by an external document platform.

## Recommendation On Visible Signature Appearance

Do **not** rebuild a handwritten signature capture UX unless legally required.

Recommended default:

- visible PKI signature block
- signer name
- signer ID or masked ID
- timestamp
- certificate serial or verification reference if appropriate

This is simpler and better aligned with the legal PKI flow.

---

## Recommended End-to-End Flows

## 1. Agreement Staging Flow

1. `backend_pro` generates the final Jadual J / K PDF.
2. `backend_pro` computes a SHA-256 hash for the generated file.
3. `backend_pro` creates an agreement/signing record in AWS with status such as `GENERATED`.
4. `backend_pro` uploads the PDF plus signature plan to the on-prem Signing Gateway.
5. The Signing Gateway stores the original PDF locally and returns:
   - `document_id`
   - `version_id`
   - local hash confirmation
   - backup status
6. AWS stores only metadata and the returned IDs, not the primary blob copy.

Important: once the document is staged on-prem, the sign flow should always use the on-prem copy, not regenerate or refetch from another system.

## 2. Certificate Check / Enrollment Flow

1. User opens signing flow in the AWS-hosted app.
2. Frontend calls `backend_pro`.
3. `backend_pro` calls the on-prem Signing Gateway.
4. Signing Gateway checks certificate status through MTSA.
5. If a certificate already exists and is valid, continue to signing.
6. If not, the Signing Gateway starts certificate enrollment.

Recommended enrollment pattern:

- keep KYC capture in AWS where it already exists
- pass **short-lived presigned URLs** or a temporary signed payload reference to on-prem
- let on-prem download only the exact KYC artifacts needed for MTSA enrollment
- do not create a second permanent KYC storage system on-prem unless required by policy

This keeps the product flow clean while still allowing MTSA to receive what it needs.

## 3. Borrower Signing Flow

1. Frontend starts signing via `backend_pro`.
2. `backend_pro` creates a sign intent with an idempotency key.
3. `backend_pro` asks the on-prem Signing Gateway to start the sign session for `document_id` and signer identity.
4. Signing Gateway validates:
   - document exists
   - signer is allowed
   - current version is correct
   - certificate is valid
5. Signing Gateway requests OTP from MTSA if OTP-based signing is required.
6. User enters OTP in the AWS-hosted UI.
7. `backend_pro` forwards the OTP to the Signing Gateway.
8. Signing Gateway signs the **local current document version** through MTSA.
9. Signing Gateway stores the new signed version locally, hashes it, records MTSA transaction details, and marks backup as pending.
10. Signing Gateway returns success to AWS and/or emits a completion webhook to AWS.
11. `backend_pro` updates business workflow state.

## 4. Company / Witness / Internal Signer Flow

Use the same Signing Gateway and the same local document record.

For each later signatory:

- the Gateway uses the latest signed version as input
- applies the next visible PKI signature based on the signature plan
- stores a new version locally
- records signer identity and MTSA response

This avoids the old DocuSeal-dependent progressive signing logic.

## 5. Completion Callback And Reconciliation

Do not rely only on the synchronous HTTP response.

Recommended pattern:

- primary path: Signing Gateway returns success synchronously
- secondary path: Signing Gateway also sends a signed callback/webhook to `backend_pro`
- safety path: `backend_pro` runs a reconciliation job for operations still marked `PENDING_CONFIRMATION`

This prevents permanent desync if the document is signed on-prem but the cloud side misses the response.

## 6. Download / Serving Flow

Because files should be served from the on-prem server:

1. User requests a document from `backend_pro`.
2. `backend_pro` performs authorization.
3. `backend_pro` issues a short-lived signed token for that document.
4. Browser is redirected to the on-prem Signing Gateway download endpoint.
5. Signing Gateway validates the token and streams the file from local disk.

Recommended token properties:

- very short TTL, for example 60 to 120 seconds
- signed with a shared per-client secret
- includes:
  - `document_id`
  - `artifact_type`
  - `requesting_user`
  - `expiry`
  - optional single-use nonce

This keeps the file bytes on the on-prem path while keeping authorization centralized.

## 7. Restore-On-Demand Flow

If a requested file is missing locally:

1. Signing Gateway checks whether an S3 backup exists.
2. If yes, it downloads the backup copy.
3. It verifies the hash.
4. It restores the file locally.
5. It serves the restored file.
6. It records a restore event in its local audit log.

This gives you the hard-disk-failure recovery behavior you asked for.

---

## Networking Recommendation

## Use Cloudflare Tunnel As The Default

Yes, **Cloudflare Tunnel is the recommended default** for this architecture.

It is the easiest option because:

- no inbound firewall ports need to be opened at the client site
- no site-to-site VPN project is required
- each client server can be deployed the same way
- it works well with a pull-from-on-prem model
- operational support is simpler than IPSec for most small and medium client environments

## How It Should Be Used

Use Cloudflare Tunnel to expose **only one on-prem application**:

- the Signing Gateway

Do **not** expose:

- raw MTSA endpoints
- local database ports
- raw file shares
- multiple legacy catch-all routes

Recommended pattern:

```text
signing.<client-domain>
  /internal/*   -> server-to-server APIs from backend_pro
  /files/*      -> short-lived tokenized browser downloads
  /health       -> health endpoint
```

## Security Controls For The Tunnel

For `/internal/*`:

- require Cloudflare Access service token or mTLS
- require application-level HMAC or signed JWT
- allow only the exact API surface needed

For `/files/*`:

- do not expose public directory browsing
- require short-lived backend-issued download tokens
- stream only after token validation

## Optional Support Access

If you want a remote ops backdoor, add **Tailscale or another admin-only remote access tool** for SSH/support purposes only.

Recommendation:

- **Cloudflare Tunnel** for production application traffic
- **optional Tailscale/SSH** for support and emergency maintenance

Do not make the product depend on Tailscale as the primary runtime path.

## When To Choose VPN Instead

Use IPSec/MPLS/private networking only if the client has a compliance rule that explicitly rejects Cloudflare Tunnel or requires private network-only application connectivity.

For the first version, VPN should be the exception, not the baseline.

---

## Storage, Backup, And Restore Recommendation

## Source Of Truth

Use this rule:

- **On-prem local storage** is the primary artifact store.
- **S3** is the off-site backup and restore copy.
- **AWS database** stores metadata, not the primary file blob.

This aligns with the requirement that documents live and are served from the on-prem server.

## Recommended Backup Pattern

Every artifact should have:

- local path
- SHA-256 checksum
- created timestamp
- artifact type
- backup status
- S3 object key
- last successful backup timestamp

Recommended artifact types:

- `original_pdf`
- `signed_pdf`
- `certificate_evidence`
- `stamp_certificate` if needed later
- `stamped_pdf` if needed later

## Recommended S3 Strategy

Use S3 as an off-site replica only.

Recommended settings:

- bucket versioning enabled
- SSE-KMS enabled
- per-client prefix separation
- lifecycle rules for retention
- optional cross-region replication later if DR needs increase

Example key shape:

```text
s3://<backup-bucket>/<client-id>/<document-id>/<version>/<artifact-type>.pdf
```

## How The On-Prem Server Should Upload To S3

The easiest secure pattern is:

- `backend_pro` issues **presigned S3 upload URLs**
- the on-prem Signing Gateway uploads directly to S3 using those URLs

This avoids long-lived AWS credentials on the client's on-prem server.

Recommended flow:

1. Gateway asks `backend_pro` for a backup upload ticket.
2. `backend_pro` returns a presigned `PUT` URL and expected metadata.
3. Gateway uploads the file directly to S3.
4. Gateway updates its local backup status.
5. Gateway optionally confirms completion back to AWS.

## How Restore Should Work

Use the same pattern in reverse:

1. Gateway asks AWS for a restore ticket.
2. AWS returns a presigned `GET` URL.
3. Gateway downloads the artifact.
4. Gateway verifies checksum.
5. Gateway restores the local copy.

## Sync / Reconciliation Jobs

The on-prem Signing Gateway should run:

- immediate upload attempt after artifact creation
- retry queue for failed backups
- scheduled reconciliation, for example hourly or nightly
- restore verification after local recovery events

Recommended states:

- `LOCAL_ONLY`
- `BACKUP_PENDING`
- `BACKUP_SYNCED`
- `BACKUP_FAILED`
- `RESTORED_FROM_BACKUP`

## Hard Disk Failure Handling

To survive disk loss:

1. Provision the on-prem server with reliable local storage.
2. Strongly prefer RAID1 or mirrored disks if the client budget allows.
3. Replicate artifacts to S3 quickly after creation.
4. Keep a restore path that can reconstruct local files from S3.

RAID helps availability, but the real DR control is **off-site artifact replication with checksum verification**.

### Server Downtime Fallback

If the on-prem server is completely unreachable (hardware failure, network loss, extended maintenance), users cannot download signed agreements from the primary path.

Recommended fallback:

- `backend_pro` detects that the Signing Gateway is unreachable (health check failure or request timeout)
- `backend_pro` falls back to serving the S3 backup copy directly using a presigned `GET` URL
- the fallback response should indicate that the document is being served from backup, not the primary copy
- once the on-prem server is restored, the primary download path resumes automatically

This fallback ensures document availability even during extended on-prem outages, while keeping on-prem as the default serving path when healthy.

---

## Source Of Truth Boundaries

The most important architectural rule is to avoid split ownership.

## AWS Is The Source Of Truth For

- loan lifecycle state
- signatory workflow state
- user authentication and authorization
- client configuration
- business audit trail
- backup ticket issuance

## On-Prem Is The Source Of Truth For

- actual document blobs
- local document versions
- MTSA transaction details
- local artifact audit events
- local backup queue state

## S3 Is The Source Of Truth For

- disaster recovery copy only

It should not become a second active document-serving system unless you explicitly choose to change the requirement later.

---

## API Boundary Recommendation

Design the Signing Gateway around a small, explicit API.

Recommended categories:

- document intake
- certificate operations
- sign operations
- download token validation / file serving
- backup/restore status
- health/reconciliation

Example operation shapes:

- `POST /internal/documents`
- `GET /internal/documents/:id`
- `POST /internal/certificates/check`
- `POST /internal/certificates/enroll`
- `POST /internal/signing/start`
- `POST /internal/signing/complete`
- `GET /internal/signing/operations/:id`
- `POST /internal/backups/reconcile`
- `GET /files/:documentId`
- `GET /health`

Keep the API narrow and idempotent.

Do not carry forward:

- DocuSeal submission APIs
- template syncing endpoints
- raw PDF upload/download endpoints without document identity
- raw MTSA pass-through exposure

---

## Duplicability For New Clients

This architecture is duplicable if each client gets the same standard deployment bundle.

## Recommended Client Bundle

Each Pro client should get:

- isolated Pro AWS stack
- one on-prem Signing Gateway deployment
- one local metadata DB
- one MTSA container import
- one local data volume
- one Cloudflare Tunnel
- one per-client secret set
- one backup bucket prefix and KMS policy

## Recommended Standardization

Standardize these across all clients:

- Docker Compose or equivalent deployment package for on-prem
- health endpoints
- backup states
- API contract between AWS and on-prem
- document versioning model
- signature plan format
- environment variable names
- support runbook

## Recommended Per-Client Config Additions

The existing `config/clients/<client>.yaml` model should remain the control record for each Pro client.

Conceptually, each client config should eventually include metadata for:

- signing gateway public hostname
- Cloudflare tunnel name
- MTSA environment (`pilot` or `prod`)
- on-prem server identifier
- signing module enabled flag
- backup bucket/prefix
- shared secrets reference
- current on-prem release version

The key point is that you should keep **one repeatable client registry model**, not invent a bespoke signing setup for every client.

### Packaging Recommendation

Treat the on-prem bundle like an appliance:

- same image
- same compose structure
- same env contract
- client-specific secrets/config only

That is much easier to operate than forked per-client code.

### Deployment And Update Model

The Signing Gateway should be deployed and updated as follows:

- the Gateway container image is built and published from the `truestack_kredit` repo (or a dedicated on-prem repo)
- deployment to the client server can use either:
  - a GitHub Actions self-hosted runner on the on-prem server (proven in `creditxpress_aws`)
  - manual SSH-based deployment with a simple deploy script
- updates are applied by pulling the new Gateway image and restarting the container
- MTSA is updated separately when Trustgate provides a new tarball (manual import, same as the old process)
- the deploy process should always create a backup before updating

Recommended default: start with **manual SSH-based deployment** with a simple script. Add a self-hosted runner later if the client count justifies it.

The key constraint is that all clients run the same Gateway image. Client-specific behavior comes only from environment variables and secrets, never from forked code.

---

## Reliability And Maintenance Recommendations

## 1. Keep The On-Prem Service Thin

Do not turn the Signing Gateway into a second backend monolith.

Thin service means:

- smaller blast radius
- faster onboarding
- fewer client-specific bugs
- easier upgrades

## 2. Use Idempotency Everywhere

Every sign action should have an idempotency key.

This protects against:

- double-clicks
- retry storms
- network disconnects after successful signing
- callback duplication

## 3. Use Reconciliation Jobs

Have a scheduled AWS reconciliation job for:

- sign operations still marked pending
- artifacts missing backup confirmation
- documents missing local copy but present in S3

This is a major improvement over trusting single-hop success only.

## 4. Add Operational Health Checks

Minimum health domains:

- Signing Gateway API healthy
- local DB healthy
- local disk writable
- MTSA reachable
- Trustgate endpoint reachable
- backup queue healthy
- Cloudflare Tunnel connected

### 5. Handle MTSA And Trustgate Unavailability

MTSA depends on Trustgate PKI servers for certificate operations and signing. If Trustgate is down:

- signing operations should **fail explicitly** with a clear error
- the system must **never silently succeed** without a valid PKI signature
- failed operations should remain in a retryable state (`PENDING_SIGNING` or equivalent)
- the admin UI should surface the Trustgate connectivity status via the health check
- the reconciliation job should retry pending operations automatically when connectivity returns

Certificate enrollment also depends on Trustgate. If enrollment fails, the user should be told to try again later rather than receiving a partial or invalid certificate.

### 6. Test Restore Regularly

A backup strategy is not real until restore is tested.

Recommended operational rule:

- run a restore drill at least monthly or quarterly
- verify checksum after restore
- verify the restored document can actually be served and read

### 7. Keep Logging Structured And Redacted

Never log:

- OTP values
- PIN values
- full certificate payloads unless absolutely required
- full KYC images
- full raw MTSA request/response bodies in normal production logging

Log:

- operation IDs
- document IDs
- signer IDs
- status codes
- timestamps
- hash values

---

## Security Recommendations

## Mandatory Controls

- per-client shared secret between AWS and on-prem
- short-lived signed download tokens
- Cloudflare Tunnel for inbound hiding
- MTSA internal only
- encrypted local disk if possible
- least-privilege S3 access model
- audit logs on both AWS and on-prem
- no OTP/PIN persistence

## Recommended Secret Pattern

Keep secrets separate by client:

- tunnel credentials
- AWS/on-prem shared API secret
- token signing secret
- MTSA credentials
- backup keying material if any

## Recommended Backup Security

If you back up to a Truestack-managed S3 bucket:

- keep client data under separate prefixes
- use strict IAM scoping
- enable KMS encryption
- document this clearly as a managed DR service

If strict client isolation is a contractual requirement, move the backup bucket to the client's AWS account later. For the easiest first cut, a Truestack-managed central backup bucket is acceptable if the contract and privacy position allow it.

---

## Why This Is Better Than Reusing The Old Architecture

This target design removes:

- DocuSeal
- template export/import overhead
- DocuSeal webhooks
- PDF retrieval from a third signing system
- signature image scraping
- route sprawl through the tunnel
- dual workflow orchestration

This target design keeps:

- MTSA integration
- on-prem local artifact ownership
- Cloudflare Tunnel convenience
- off-site backup capability

This means lower long-term maintenance with fewer systems to patch, monitor, and debug.

---

## Recommended Implementation Order

## Phase 1. Establish The On-Prem Signing Gateway Contract

Build the architecture contract first:

- document intake
- certificate check/enroll
- sign operation
- download token validation
- backup sync

## Phase 2. Tie Agreement Generation To Signature Plans

When a Jadual J / K PDF is generated, also produce the signatory placement plan.

## Phase 3. Implement Borrower Certificate And Signing Flow

Get the borrower OTP/certificate/sign flow working end to end before internal signer flows.

## Phase 4. Add Multi-Signatory Progression

Reuse the same local document and apply sequential signatures by role.

## Phase 5. Add Backup/Reconciliation/Restore

Make sure S3 replication and restore-on-demand are working before production rollout.

## Phase 6. CI/CD Pipeline And Secrets Setup

Set up the deployment pipeline before hardening:

- create `deploy-signing-gateway.yml` GitHub Actions workflow
- build Signing Gateway image and push to GHCR
- configure SSH deployment through Cloudflare Tunnel
- set up GitHub environment secrets per client (SSH key, CF Access tokens)
- place on-prem `.env` with MTSA credentials, signing API key, GHCR token, and tunnel token
- add `signing_gateway_url` and `signing_api_key` to client AWS Secrets Manager
- verify end-to-end deployment pipeline with demo-client
- see `docs/architecture_plan.md` Section 12.12–12.13 for full details
- see `docs/mtsa_api_reference.md` for MTSA API contract

## Phase 7. Harden Operations

Add:

- health checks
- reconciliation jobs
- restore drill process
- support runbook
- provisioning checklist (`docs/signing-gateway-provisioning.md`)

---

## Explicit Decisions

## Should We Use Cloudflare Tunnel?

Yes.

Use it as the default because it is the easiest and most repeatable connectivity option for client on-prem deployments.

## Should We Keep DocuSeal?

No.

`truestack_kredit` already owns agreement generation, so DocuSeal would only add another component and another state machine.

## Should Files Be Stored On-Prem First?

Yes.

That should be the canonical storage location for the legal artifact, with S3 as DR copy.

## Should Files Be Served From On-Prem?

Yes.

Use short-lived signed tokens and direct browser download from the Signing Gateway.

## Should S3 Become The Primary File Store?

No, not for this requirement.

Keep S3 as backup/restore, not the serving origin.

## Should MTSA Be Exposed Through The Tunnel?

No.

Only the Signing Gateway should be exposed.

## Should The On-Prem Server Also Own Business Workflow State?

No.

Keep workflow state in AWS and artifact state on-prem.

---

## Final Recommendation

For `truestack_kredit` Pro clients, the best architecture is a **hybrid control-plane / signing-plane split**:

- `backend_pro` in AWS remains the application brain
- a per-client **On-Prem Signing Gateway** becomes the PKI and document appliance
- **MTSA stays local**
- **Cloudflare Tunnel** is the default networking model
- **signed files stay on-prem**
- **S3 is the backup and restore layer**
- **DocuSeal is removed completely**

If you follow that shape, the system will be easier to duplicate for every new client, easier to support, and much less fragile than the old `DocuSeal + orchestrator + MTSA` stack.
