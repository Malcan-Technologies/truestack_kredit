# Agreement File Handling & Backup

This document describes how signed loan agreement PDFs are stored, backed up, and managed across the on-prem signing server and backend storage.

## Architecture Overview

Signed agreements exist in **two locations**:

1. **On-prem server** (Signing Gateway) — primary storage, where the PKI-signed PDF is first written after MTSA signing
2. **Backend storage** (local in dev, S3 in production) — secondary copy, saved by `backend_pro` immediately after the signing gateway returns the signed PDF

```
┌──────────────┐      sign-and-store       ┌───────────────────┐
│  backend_pro │ ──────────────────────────>│  Signing Gateway  │
│              │                            │  (on-prem)        │
│              │<── signed PDF base64 ──────│                   │
│              │                            │  Stores PDF at:   │
│  Saves copy  │                            │  /data/documents/ │
│  to storage  │                            │  {loanId}/        │
│  (local/S3)  │                            │  signed-agreement │
└──────────────┘                            │  -{timestamp}.pdf │
                                            └───────────────────┘
```

Both copies are written during the same signing request. If either write fails, the other may still succeed — they are not transactional.

## On-Prem Storage (Signing Gateway)

### Directory Structure

Files are stored under `STORAGE_PATH` (default `/data/documents`), organised by loan ID:

```
/data/documents/
  {loanId}/
    signed-agreement-{timestamp}.pdf      # The signed PDF
    signed-agreement-{timestamp}.json     # Metadata sidecar
```

Each signing event creates a new timestamped pair. The latest file (lexicographic sort, descending) is treated as the current version.

### Metadata Sidecar (JSON)

```json
{
  "loanId": "cmn...",
  "filename": "signed-agreement-1775624304808.pdf",
  "originalName": "signed-agreement-cmn....pdf",
  "sizeBytes": 37783,
  "signedAt": "2026-04-08T04:58:24.810Z",
  "signerUserId": "891114075601",
  "signerName": "Ivan Chew Ken Yoong"
}
```

### Version History

Multiple signing events on the same loan (borrower → company rep → witness) create multiple files in the same directory. Each internal signer reads the latest PDF, applies their signature, and writes a new version:

- `signed-agreement-1775624304808.pdf` — v1 (borrower signed)
- `signed-agreement-1775625569033.pdf` — v2 (company rep signed)
- `signed-agreement-1775625903441.pdf` — v3 (witness signed, fully signed)

### Docker Volume

In development, the on-prem storage is a Docker named volume `signing-data` mounted at `/data/documents`. In production, this should be mapped to persistent host storage (e.g. a dedicated disk or NAS mount).

### Relevant Code

- `apps/signing-gateway/src/services/documentStorage.ts` — all file I/O functions
- `apps/signing-gateway/src/routes/api.ts` — `POST /api/sign-and-store` triggers storage

## Backend Storage (Backup)

### How It Works

After the signing gateway returns the signed PDF (as base64), `backend_pro` saves a copy using `saveAgreementFile()`:

- **Development**: Written to the local filesystem under `UPLOAD_DIR/agreements/`
- **Production**: Uploaded to S3 (`S3_BUCKET/agreements/`)

The stored path is recorded on the `Loan` model:

| Field | Purpose |
|-------|---------|
| `agreementPath` | Path to the latest fully signed agreement |
| `agreementFilename` | Generated storage filename |
| `agreementOriginalName` | Human-readable original name |
| `agreementSize` | File size in bytes |
| `agreementUploadedAt` | Timestamp of last upload |
| `agreementVersion` | Incremented with each signing event |
| `borrowerSignedAgreementPath` | Borrower-only signed PDF (before internal signatures) |

### Configuration

| Environment Variable | Dev Default | Production |
|---------------------|-------------|------------|
| `STORAGE_TYPE` | `local` | `s3` (required) |
| `UPLOAD_DIR` | `./uploads` | N/A |
| `S3_BUCKET` | `kredit-uploads` | Required |
| `S3_ACCESS_KEY` | — | Required (or use IAM role) |
| `S3_SECRET_KEY` | — | Required (or use IAM role) |

### Relevant Code

- `apps/backend_pro/src/lib/storage.ts` — abstraction layer (local + S3)
- `apps/backend_pro/src/modules/borrower-signing/routes.ts` — borrower signing, saves to both
- `apps/backend_pro/src/modules/admin-signing/routes.ts` — internal signing, saves to both

## Signing Flow & File Versions

For online-originated loans, the agreement goes through up to 3 signing stages:

| Stage | Signer | Auth | Version | On-Prem | Backend |
|-------|--------|------|---------|---------|---------|
| 1 | Borrower | Email OTP | v1 | Yes | Yes (also saved as `borrowerSignedAgreementPath`) |
| 2 | Company Representative | PIN | v2 | Yes | Yes (overwrites `agreementPath`) |
| 3 | Witness | PIN | v3 | Yes | Yes (overwrites `agreementPath`) |

After stage 3, the loan is auto-approved. Each stage reads the latest PDF from backend storage, sends it to the signing gateway for PKI signing + on-prem storage, and saves the returned signed PDF back to backend storage.

Physical loans bypass the signing gateway entirely — the admin uploads a manually signed PDF, which is saved only to backend storage.

## Agreements Management Page

**Location**: Admin Pro → TrueKredit Pro → Agreements

### Features

- **Server status**: Shows whether the on-prem signing gateway is online or offline
- **Agreements table**: Lists all loans with agreements, showing:
  - Borrower name and IC
  - File metadata (name, size, version, date)
  - Loan channel (Digital vs Physical)
  - On-prem availability (checked live against the signing gateway)
  - Backup availability (checked from the database `agreementPath` field)
- **Filters**: All, Online origination, Physical, Missing from server
- **Restore per file**: For digitally signed agreements missing from the on-prem server, a "Restore" button reads the backup copy and pushes it to the signing gateway
- **Batch restore**: A "Restore all" button syncs all missing files in one operation

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/agreements` | List agreements with on-prem availability check |
| `POST` | `/api/admin/agreements/:loanId/sync` | Restore single file to on-prem |
| `POST` | `/api/admin/agreements/sync-batch` | Restore multiple files to on-prem |

### Signing Gateway Endpoints (used by sync)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/documents` | List all stored documents on-prem |
| `POST` | `/api/documents/check` | Batch check which loan IDs have files |
| `POST` | `/api/documents/:loanId/restore` | Upload a PDF to on-prem storage |
| `GET` | `/api/documents/:loanId/signed` | Stream the latest signed PDF |

## Recovery Scenarios

### On-prem server data loss

If the on-prem server's storage is wiped (disk failure, container rebuild without persistent volume):

1. Navigate to Admin Pro → TrueKredit Pro → Agreements
2. Filter by "Missing from server"
3. Click "Restore all" to push all backup copies to the on-prem server

Files are restored with new timestamps and a `Restored from backup` marker in metadata.

### Backend storage loss

If the backend storage is lost (local disk or S3 data), the on-prem copies remain intact. However, there is currently no automated reverse sync (on-prem → backend). To recover:

1. Use the signing gateway's `GET /api/documents/:loanId/signed` endpoint to download each PDF
2. Re-upload through the admin portal or manually update the database paths

### Both copies lost

If both copies are lost, the signed agreement is unrecoverable. The original unsigned agreement can be regenerated from the loan data, but the PKI signatures cannot be recreated — the borrower and internal signers would need to re-sign.

## Important Notes

- Physical loans only have a backend copy (no on-prem copy), so the on-prem column shows "N/A"
- On-prem availability can only be checked when the signing gateway is online
- The restore operation writes a new timestamped file — it does not overwrite existing files
- All signing gateway endpoints require the `X-API-Key` header for authentication
- The `SIGNING_API_KEY` must match between `backend_pro` and the signing gateway
