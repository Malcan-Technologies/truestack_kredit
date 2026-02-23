# Kredit: Handling Document Images from Admin Status Webhook

When Admin sends `kyc.session.completed` to Kredit's status webhook, the payload may include `document_images` with presigned URLs for KYC document images.

## Payload Structure

```json
{
  "event": "kyc.session.completed",
  "session_id": "uuid",
  "ref_id": "string",
  "tenant_id": "string",
  "borrower_id": "string",
  "status": "completed",
  "result": "approved",
  "reject_message": null,
  "document_name": "string",
  "document_number": "string",
  "metadata": {},
  "timestamp": "2025-02-18T12:00:00.000Z",
  "document_images": {
    "DIRECTOR_IC_FRONT": { "url": "https://s3...presigned..." },
    "DIRECTOR_IC_BACK": { "url": "https://s3...presigned..." },
    "DIRECTOR_PASSPORT": { "url": "https://s3...presigned..." },
    "SELFIE_LIVENESS": { "url": "https://s3...presigned..." }
  }
}
```

## Implementation Checklist for Kredit

1. **Verify webhook signature** – Validate `x-trueidentity-signature` and `x-trueidentity-timestamp` before processing.

2. **Handle `document_images`** – When `event === "kyc.session.completed"` and `document_images` exists:
   - For each key in `document_images`, update the corresponding Borrower Document section **only if that key exists**.
   - Mapping:
     - `DIRECTOR_IC_FRONT` → IC Front document
     - `DIRECTOR_IC_BACK` → IC Back document
     - `DIRECTOR_PASSPORT` → Passport document
     - `SELFIE_LIVENESS` → Selfie / Liveness document
   - `COMPANY_PROFILE` is not sent by Admin (not from KYC flow); do not expect it.

3. **Store the URL or fetch the image** – Option A: Store the presigned URL and display by loading it (URLs expire in 24 hours). Option B: Fetch the image from the URL when the webhook is received and store it in Kredit's own storage for permanent access.

4. **Display like KYC Session Details** – Show:
   - Thumbnail/preview of the image (load from URL)
   - "Open Full Size" link that opens the same URL in a new tab

5. **Only update if key exists** – If `document_images.DIRECTOR_IC_FRONT` exists, update that section. If it doesn't exist in the payload, leave the existing borrower document unchanged for that category.

## Implementation Status

- **Backend**: `apps/backend/src/modules/trueidentity/documentImagesFromWebhook.ts` – Fetches images from presigned URLs and stores them in Kredit's storage (Option B) for permanent access.
- **Webhook**: `apps/backend/src/modules/webhooks/trueIdentityWebhook.ts` – On `kyc.session.completed`, processes `document_images` and creates/updates BorrowerDocument records.
- **Details update**: On `kyc.session.completed`, when `document_name` or `document_number` are present in the payload, the webhook updates:
  - **Corporate directors**: `BorrowerDirector.name` and `BorrowerDirector.icNumber` from the verified KYC data.
  - **Individual borrowers**: `Borrower.name` and `Borrower.icNumber` from the verified KYC data.
- **Frontend**: Borrower Documents section shows image preview (thumbnail) and "Open Full Size" link for each document, matching KYC Session Details in Admin.
