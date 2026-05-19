# TrueStack TrueSSM™ API

This guide describes how external clients integrate with the TrueStack TrueSSM™ API for Malaysian registry entity search, company/business reports, particulars, and document retrieval.

## Base URL

| Environment | Base URL |
| --- | --- |
| Production | `https://api.truestack.my` |
| Local development | `http://localhost:3001` |

All endpoints use HTTPS in production, accept JSON request bodies, and return JSON responses.

## Authentication

Use a TrueSSM™ API key generated from the TrueStack Admin portal. TrueSSM™ keys are separate from TrueIdentity keys.

```http
Authorization: Bearer <ssm_api_key>
Content-Type: application/json
```

Requests without a valid active TrueSSM™ key return `UNAUTHORIZED`.

## Request Rules

- Use `POST` for every endpoint.
- Send `Content-Type: application/json`.
- Send only documented fields. Unknown fields are ignored.
- Registry numbers are strings. Do not send numbers, because leading zeroes and suffixes may be meaningful.
- Timestamps returned by TrueStack are ISO 8601 UTC strings. Convert them to your local timezone for display.

## Idempotency

For safe retries, send an `Idempotency-Key` header on report and document calls.

```http
Idempotency-Key: report_pull_123
```

Idempotency is scoped to the client and the exact operation/request payload. If a request with the same key was already delivered or already billed as a failed document pull for the same client, TrueStack returns the previous result or error with `acknowledgement.idempotent: true`; credits are not deducted again. If the matching earlier request failed without billing, TrueStack returns the stored error with `idempotent: true`.

If the same key is reused for a different operation or request payload, TrueStack returns `IDEMPOTENCY_KEY_MISMATCH`. If the same key is reused while the matching earlier request is still pending, the API returns `REQUEST_IN_PROGRESS`. Use a stable key per logical report pull, not one shared across different companies or operations.

## Success Response

Successful calls return HTTP `200` with `data` and `acknowledgement`. `data` contains the registry provider response wrapped in an operation-specific envelope (for example `getCompProfile` for `reports/company-profile`). Field names within the envelope are **provider-native** and can vary by operation. See [Company Profile Response Reference](#company-profile-response-reference) for the full shape of a company-profile response, including all `roc*` sibling blocks (registered address, officers, shareholders, charges, share capital, etc.).

Abbreviated example showing the envelope structure:

```json
{
  "data": {
    "getCompProfile": {
      "clientRefNo": "TS-SSM-550e8400-e29b-41d4-a716-446655440000",
      "requestRefNo": "WLSQ0RXMFN1779163449911",
      "successCode": "00",
      "errorMsg": "",
      "infoId": "119623414",
      "rocCompanyInfo": {
        "companyName": "HICOM HOLDINGS BERHAD",
        "companyNo": "67",
        "companyType": "S",
        "statusOfCompany": "E",
        "incorpDate": "1910-03-10T17:00:00.000Z",
        "businessDescription": "MANAGEMENT SERVICES TO COMPANIES IN DRB-HICOM BERHAD GROUP ..."
      },
      "rocRegAddressInfo": {
        "address1": "LEVEL 5,WISMA DRB-HICOM",
        "address2": "NO.2 JALAN USAHAWAN U1/8",
        "address3": "SEKSYEN U1,SHAH ALAM",
        "postcode": "40150",
        "state": "B",
        "town": "SHAH ALAM"
      },
      "rocCompanyOfficerListInfo": {
        "rocCompanyOfficerInfos": {
          "rocCompanyOfficerInfos": [
            { "name": "DATO' SRI ...", "idNo": "650923105105", "idType": "MK", "designationCode": "D", "startDate": "2016-01-03T16:00:00.000Z" }
          ]
        }
      },
      "rocShareholderListInfo": {
        "rocShareholderInfos": {
          "rocShareholderInfos": [
            { "name": "DRB-HICOM BERHAD", "idNo": "203430-W", "idType": "C", "share": "1100253627.00" }
          ]
        }
      }
    }
  },
  "acknowledgement": {
    "usage_id": "550e8400-e29b-41d4-a716-446655440000",
    "usage_type": "company_profile",
    "acknowledged_at": "2026-05-07T06:30:00.000Z",
    "billed_credits": 154,
    "request_id": "WLSQ0RXMFN1779163449911"
  }
}
```

> **Important:** list blocks (officers, shareholders, charges, balance sheets, profit & loss, document lodgements, business codes) are returned **double-wrapped**: `rocXyzListInfo.rocXyzInfos.rocXyzInfos` is the actual array. Consumers must walk both layers.

`acknowledgement` is TrueStack's billing and delivery receipt:

| Field | Type | Description |
| --- | --- | --- |
| `usage_id` | string | TrueStack report pull id. Use this when contacting TrueStack support. |
| `usage_type` | string | Billing usage type for the operation. |
| `acknowledged_at` | string | UTC timestamp when the pull was delivered and billed, or when a failed document pull was billed. |
| `billed_credits` | number | Credits deducted for this operation. `entity_search` is always `0`. |
| `request_id` | string or null | Provider request reference when available. |
| `idempotent` | boolean | Present only when returning a previous delivered result or billed failed document pull for the same `Idempotency-Key`. |

## Success Codes

| HTTP | Code / Signal | Meaning |
| --- | --- | --- |
| 200 | `acknowledgement` present | Request was delivered successfully. The operation was billed according to `billed_credits`. |
| 200 | `acknowledgement.billed_credits = 0` | Free operation delivered successfully, currently used by `entities/search`. |
| 200 | `acknowledgement.idempotent = true` | Existing delivered response returned for the same idempotency key. No duplicate billing occurred. |
| 200 | Provider `successCode = "00"` | Registry provider marked the response successful. This field is inside `data` when provided upstream. |

## Billing

Pricing is configured per client and per `usage_type`. Credits are usually deducted after a successful provider response has been received and TrueStack returns an acknowledgement.

Document operations are the exception: after the free entity validation passes and TrueStack requests scanned-document data from the registry provider, failed `documents/list` and `documents/image` pulls are billed according to your pricing tier when the provider returns a chargeable report/document failure such as `REPORT_NOT_FOUND`, `REGISTRY_ERROR`, or `REGISTRY_UNAVAILABLE`. The error response includes an `acknowledgement` block with the charged credits.

After the credit check passes for billable entity-backed report calls, TrueStack validates the registry number using the **free entity search** step. If validation finds no entity, TrueStack blocks the billable call and does not deduct credits. Profile endpoints also check that the entity type matches the requested profile type.

If overdraft is disabled and the client balance cannot cover the selected operation, TrueStack returns `INSUFFICIENT_CREDITS` before calling any registry provider endpoint, including the free validation endpoint.

### Sandbox and trial environments

Some registry **trial or sandbox** programmes restrict which **registration numbers** may receive certain products—**especially scanned documents**—to an approved test matrix. **Entity search** may still return entities for numbers outside that matrix, but **`documents/list`** or **`documents/image`** can fail at the registry as an invalid or unsupported case for that programme. Use registration numbers your TrueStack contact confirms for your environment; production subscriptions typically follow normal registry rules.

## Template pricing

Many clients start on TrueStack’s **default template pricing** below. Wallet **credits** convert to ringgit at **10 credits = RM 1** unless your contract states otherwise.

Custom pricing tiers may override these amounts. For every response, **`acknowledgement.billed_credits`** is authoritative.

| `usage_type` | Template credits |
| --- | ---: |
| `entity_search` | 0 |
| `company_profile` | 154 |
| `business_profile` | 154 |
| `officers` | 232 |
| `share_capital` | 232 |
| `shareholders` | 232 |
| `registered_address` | 232 |
| `company_secretary` | 232 |
| `charges` | 232 |
| `audit_firm` | 132 |
| `llp_profile` | 254 |
| `document_list` | 154 |
| `document_image` | 154 |

The automatic **entity search** validation step is accounted under **`entity_search`** (**0** credits); it does not add a separate line item beyond the table above.

## Endpoint summaries

Below, **`POST /api/v1/ssm/<path>`** means **`POST {base}/api/v1/ssm/<path>`**. Summaries reflect what the Malaysian registry provider exposes through TrueStack; field names in **`data`** follow the provider’s JSON (native keys).

| TrueStack endpoint | Template credits | What this pull is for |
| --- | ---: | --- |
| `POST /api/v1/ssm/entities/search` | 0 | Match entities by **`regNo`** and/or **`name`** with pagination; does **not** list available reports or scanned documents. |
| `POST /api/v1/ssm/reports/company-profile` | 154 | ROC company profile: (a) company name and registration number, (b) date of establishment, type and status, (c) registered address, (d) share information, (e) officers and secretary, (f) shareholder details, (g) charges, (h) financial information. |
| `POST /api/v1/ssm/reports/business-profile` | 154 | ROB business profile: (a) business name and registration number, (b) main business address, (c) ownership type, (d) business start date, (e) registration date, (f) registration expiry, (g) date of latest change, (h) status, (i) termination date, (j) conversion to LLP where applicable, (k) business type/category, (l) branch details, (m) current and previous owners. |
| `POST /api/v1/ssm/reports/shareholders` | 232 | Shareholder particulars: (a) name, (b) ID, (c) address, (d) shares held, (e) date of change, (f) shares acquired and disposed. |
| `POST /api/v1/ssm/reports/share-capital` | 232 | Share capital: (a) total issued (RM and units), (b) ordinary and preference shares, (c) share allotment, (d) allotment details (name, address, entity, share units). |
| `POST /api/v1/ssm/reports/officers` | 232 | Directors/officers: (a) current officers, (b) previous officers, (c) residential address, (d) appointment date, (e) resignation date. |
| `POST /api/v1/ssm/reports/company-secretary` | 232 | Company secretary: name, IC number, ethnicity, gender, nationality, residential address, licence details, status, removal date. |
| `POST /api/v1/ssm/reports/registered-address` | 232 | Registered address information and history of changes. |
| `POST /api/v1/ssm/reports/charges` | 232 | Charges: charge number, type of instrument, properties affected, charge type, date of certificate (Form 40). |
| `POST /api/v1/ssm/reports/audit-firm` | 132 | Audit firm: (a) firm number, (b) auditor name, (c) licence number, (d) commencement date, (e) address. Uses **`adtFirmNo`**; not scoped by company **`regNo`**. |
| `POST /api/v1/ssm/reports/llp-profile` | 254 | LLP current profile: entity name and registration number, establishment details, addresses, business code, partner information. |
| `POST /api/v1/ssm/documents/list` | 154 | **View scanned documents**: metadata only—(a) form type, (b) document date, (c) total pages, (d) document version id (**`verId`**) for each row. Call this (or use a cached list) before **`documents/image`**. |
| `POST /api/v1/ssm/documents/image` | 154 | **Scanned document**: binary/content for one filing (**`docContent`**, typically base64). Requires **`regNo`** and **`verId`** from **`documents/list`** (or equivalent cached metadata). |

## Automatic Entity Validation

For billable company, business, LLP, and document operations, TrueStack validates the supplied registry number with the **free entity search** step after the credit check passes. If the search returns no entity, TrueStack returns `ENTITY_NOT_FOUND`; no report is pulled and no credits are deducted.

Clients do not need to call `entities/search` separately before report endpoints. The validation is automatic for endpoints that accept `regNo` or, for LLP profile, `entityNoOldFormat`.

TrueStack also uses the `entityType` returned by entity search to route profile endpoints:

| Registry `entityType` | Valid profile endpoint |
| --- | --- |
| `Company` | Company Profile, including Sdn. Bhd. and Bhd entities |
| `Business` | Business Profile, including Sole Proprietorship and Partnership entities |
| `Limited Liability Partnerships` | LLP Profile only |

If a client calls the wrong endpoint for the entity type, such as calling `reports/business-profile` for a Sdn. Bhd. or Bhd company, TrueStack returns `ENTITY_TYPE_MISMATCH`; no billable provider call is made and no credits are deducted.

Non-profile paid endpoints, such as View Scanned Documents, Scanned Document, Particulars of Directors/Officers, Share Capital, Shareholders, Registered Address, Company Secretary, and Charges, are not blocked by `entityType`. They still run entity-existence validation when they accept a registry number, then call the requested provider endpoint. For non-document reports, if the provider has no data for that specific report, TrueStack returns `REPORT_NOT_FOUND` and does not deduct TrueStack credits. For document operations, provider failures after validation are billed because the upstream document endpoint has already been requested.

The audit firm endpoint uses `adtFirmNo` and is not validated through entity search.

Entity Search returns matching entities only. It does not return a list of available paid reports/endpoints for an entity, so it cannot be used to determine whether an entity has directors/officers, share capital, shareholders, charges, scanned documents, or other paid report data. If a non-document paid endpoint returns no report data, TrueStack returns `REPORT_NOT_FOUND` and does not deduct TrueStack credits.

## Usage Types

Path segments below are appended to **`POST /api/v1/ssm/`**. Template credits apply when your account uses default template pricing; see [Template pricing](#template-pricing).

| Endpoint path | Operation name | Usage type | Billing | Template credits |
| --- | --- | --- | --- | ---: |
| `entities/search` | Entity Search | `entity_search` | Free | 0 |
| `reports/business-profile` | Business Profile | `business_profile` | Billable | 154 |
| `reports/company-profile` | Company Profile | `company_profile` | Billable | 154 |
| `reports/officers` | Particulars of Directors/Officers | `officers` | Billable | 232 |
| `reports/share-capital` | Particular of Share Capital | `share_capital` | Billable | 232 |
| `reports/shareholders` | Particular of Shareholder | `shareholders` | Billable | 232 |
| `reports/registered-address` | Particulars of Registered Address | `registered_address` | Billable | 232 |
| `reports/company-secretary` | Particular of Company Secretary | `company_secretary` | Billable | 232 |
| `reports/charges` | Company charges | `charges` | Billable | 232 |
| `reports/audit-firm` | Audit firm profile | `audit_firm` | Billable | 132 |
| `reports/llp-profile` | LLP Profile | `llp_profile` | Billable | 254 |
| `documents/list` | View Scanned Documents | `document_list` | Billable | 154 |
| `documents/image` | Scanned Document | `document_image` | Billable | 154 |

## Endpoints

### Entity Search

Search Malaysian registry entities by registration number or name. This endpoint returns matching entities and pagination fields; it does not return available paid reports/endpoints.

```http
POST /api/v1/ssm/entities/search
```

Request body:

```json
{
  "regNo": "201801000082",
  "name": "Example Sdn. Bhd.",
  "page": "1",
  "entityType": "company"
}
```

Rules:

- Either `regNo` or `name` is required.
- `page` is optional and should be sent as a string when paginating search results.
- `entityType` is optional and provider-dependent.
- This operation is free and returns `billed_credits: 0`.

### Company Profile

Pull a ROC company profile report.

```http
POST /api/v1/ssm/reports/company-profile
```

Request body:

```json
{
  "regNo": "201801000082"
}
```

The response envelope is `data.getCompProfile` and contains the following sibling blocks (any may be empty or omitted if the registry has no data):

| Block | Type | Contents |
| --- | --- | --- |
| `rocCompanyInfo` | object | Identity, status, type, incorporation date, business description. |
| `rocRegAddressInfo` | object | Registered office address. |
| `rocBusinessAddressInfo` | object | Main business address. |
| `rocShareCapitalInfo` | object | Authorised, issued, ordinary/preference/other share details. |
| `rocCompanyOfficerListInfo` | wrapped list | Directors and officers (current). |
| `rocShareholderListInfo` | wrapped list | Shareholders (current). |
| `rocChargesListInfo` | wrapped list | Registered charges (mortgages, debentures, etc.). |
| `rocBalanceSheetListInfo` | wrapped list | Annual balance sheets filed via Form 24/Form 557. |
| `rocProfitLossListInfo` | wrapped list | Annual profit & loss filed via Form 24/Form 557. |
| `rocBusinessCodeListInfo` | wrapped list | MSIC business activity codes with priority. |
| `rocDocumentLodgeListInfo` | wrapped list | History of lodged documents and form types. |

See [Company Profile Response Reference](#company-profile-response-reference) for the field-by-field shape of each block and the [code reference](#provider-code-reference) for decoding single-letter values returned by SSM.

### Business Profile

Pull a ROB business profile report.

```http
POST /api/v1/ssm/reports/business-profile
```

```json
{
  "regNo": "200703114473"
}
```

### LLP Profile

Pull an LLP current profile report.

```http
POST /api/v1/ssm/reports/llp-profile
```

```json
{
  "entityNoOldFormat": "LLP0039967-LGN"
}
```

### Particulars of Directors/Officers

```http
POST /api/v1/ssm/reports/officers
```

```json
{
  "regNo": "191001000005"
}
```

### Particular of Share Capital

```http
POST /api/v1/ssm/reports/share-capital
```

```json
{
  "regNo": "199701030038"
}
```

### Particular of Shareholder

```http
POST /api/v1/ssm/reports/shareholders
```

```json
{
  "regNo": "199701030038"
}
```

### Particulars of Registered Address

```http
POST /api/v1/ssm/reports/registered-address
```

```json
{
  "regNo": "201801000082"
}
```

### Particular of Company Secretary

```http
POST /api/v1/ssm/reports/company-secretary
```

```json
{
  "regNo": "201801000082"
}
```

### Company Charges

```http
POST /api/v1/ssm/reports/charges
```

```json
{
  "regNo": "200101023327"
}
```

### Audit Firm Profile

Pull audit firm particulars. This endpoint uses an audit firm number and does not run entity-search validation.

```http
POST /api/v1/ssm/reports/audit-firm
```

```json
{
  "adtFirmNo": "AF1234"
}
```

### View Scanned Documents

List available scanned document metadata for a company ([summary](#endpoint-summaries)). It is not Entity Search and does not list other report types—only scanned-document rows. Use the returned **`verId`** values with **`documents/image`** (or cache them for later image pulls).

```http
POST /api/v1/ssm/documents/list
```

```json
{
  "regNo": "200701018579"
}
```

### Scanned Document

Retrieve a scanned document image/content by registration number and document version id.

```http
POST /api/v1/ssm/documents/image
```

```json
{
  "regNo": "200701018579",
  "verId": "4590593"
}
```

The provider response may contain a `docContent` string. Treat this as document content from the registry provider, typically base64-encoded.

## Examples

### Company Profile

```bash
curl -X POST https://api.truestack.my/api/v1/ssm/reports/company-profile \
  -H "Authorization: Bearer ssm_live_..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: company-profile-201801000082-001" \
  -d '{ "regNo": "201801000082" }'
```

### Entity Search

```bash
curl -X POST https://api.truestack.my/api/v1/ssm/entities/search \
  -H "Authorization: Bearer ssm_live_..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: search-201801000082-001" \
  -d '{ "regNo": "201801000082" }'
```

### Document Image

```bash
curl -X POST https://api.truestack.my/api/v1/ssm/documents/image \
  -H "Authorization: Bearer ssm_live_..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: document-image-200701018579-4590593-001" \
  -d '{ "regNo": "200701018579", "verId": "4590593" }'
```

## Company Profile Response Reference

The `data.getCompProfile` envelope returns a fixed set of sibling blocks regardless of whether the registry actually has data for them. Empty blocks may appear as `{}` (object), `{ "rocXyzInfos": { "rocXyzInfos": [] } }` (empty wrapped list), or with `successCode: "00"` and no other meaningful keys. Consumers should walk every block defensively.

### Envelope-level fields

| Field | Type | Notes |
| --- | --- | --- |
| `clientRefNo` | string | TrueStack-issued reference, prefixed `TS-SSM-<usage_id>`. Echoes `acknowledgement.usage_id`. |
| `requestRefNo` | string | Provider-issued request reference. Mirrors `acknowledgement.request_id`. |
| `successCode` | string | `"00"` indicates the provider returned a successful payload. |
| `errorMsg` | string | Provider-side error string. Usually empty on success. |
| `infoId` | string | Provider info identifier (opaque). |

### `rocCompanyInfo` — identity block

| Field | Type | Notes |
| --- | --- | --- |
| `companyName` | string | Current registered company name. |
| `companyOldName` | string | Last previous name, if any. |
| `companyNo` | string | SSM registration number. **Do not assume length** — older numbers may be very short (e.g. `"67"` for entities incorporated in 1910). |
| `checkDigit` | string | Optional single-character check digit appended to the registration number. |
| `companyCountry` | string | ISO-3 country code (e.g. `"MAL"`). |
| `companyType` | string code | See [Company Type codes](#company-type-codes). |
| `companyStatus` | string code | Legacy single-letter code; not always meaningful. Prefer `statusOfCompany`. |
| `statusOfCompany` | string code | See [Company Status codes](#company-status-codes). |
| `currency` | string | Reporting currency (typically `"RM"`). |
| `dateOfChange` | ISO date string | Last date the registry changed identity-level data. |
| `incorpDate` | ISO date string | Date of incorporation (UTC; see [Date handling](#date-handling)). |
| `latestDocUpdateDate` | ISO datetime string | Last time any company document was updated. |
| `lastUpdateDate` | ISO datetime string | Last time this block was refreshed by the registry. |
| `localforeignCompany` | string code | `"L"` = Local, `"F"` = Foreign. |
| `businessDescription` | string | Free-text description of business activities. |
| `balaceSheetInfo`, `balaceSheetInfoDesc` | string | Provider note about balance sheet availability. **Note: spelled `balace`, not `balance`, in the provider payload.** |
| `incomeStatInfo`, `incomeStatInfoDesc` | string | Provider note about income statement availability. |
| `llpInfo`, `llpInfoDesc`, `llpName`, `llpNo` | string | LLP cross-references when the entity converted to/from an LLP. |
| `naBal`, `naProf` | string | Provider flags for "not applicable" balance / profit data. |
| `wupType` | string | Winding-up type when status indicates winding-up. |
| `infoColon` | string | Provider scratch field, generally empty. |

### `rocRegAddressInfo` / `rocBusinessAddressInfo` — address blocks

Both objects share the same shape. Prefer `rocRegAddressInfo` (registered office) as the canonical address; fall back to `rocBusinessAddressInfo` for the main business address.

| Field | Type | Notes |
| --- | --- | --- |
| `address1` | string | Street line 1. |
| `address2` | string | Street line 2. |
| `address3` | string | Street line 3 / additional. |
| `town` | string | City / town name. |
| `state` | string code | Malaysian state code; see [State codes](#malaysian-state-codes). |
| `postcode` | string | 5-digit Malaysian postcode. |
| `companyNo` | string | Echoes `rocCompanyInfo.companyNo`. |
| `lastUpdateDate` | ISO datetime | Last time the address was modified at the registry. |
| `errorMsg`, `infoId`, `successCode` | string | Standard provider response metadata. |

### `rocShareCapitalInfo` — share capital block

| Field | Type | Notes |
| --- | --- | --- |
| `authorisedCapital` | numeric string | Authorised capital in RM. |
| `totalIssued` | numeric string | **Total issued (paid-up) capital in RM.** This is the canonical paid-up capital figure for the company. |
| `currency` | string | `"RM"` for Malaysia. |
| `currenyNominal` | string | Label for nominal value column (e.g. `"NOMINAL (sen)"`). **Note: spelled `cureny`, not `currency`, in the provider payload.** |
| `ordNumberOfShares` | numeric string | Total ordinary shares issued. |
| `ordIssuedCash` | numeric string | Ordinary shares issued for cash. |
| `ordIssuedNonCash` | numeric string | Ordinary shares issued otherwise than for cash. |
| `ordIssuedNominal` | numeric string | Nominal value (sen) per ordinary share. |
| `ordNominalValue` | numeric string | Same as `ordIssuedNominal`, exposed separately. |
| `ordAmountValue` | numeric string | Total ordinary share value (RM). |
| `ordA*` / `ordB*` | numeric string | Class-A / Class-B ordinary share breakdowns (same suffixes as above). |
| `prefNumberOfShares`, `prefIssuedCash`, `prefIssuedNonCash`, `prefIssuedNominal`, `prefNominalValue`, `prefAmountValue` | numeric string | Preference share equivalents of the ordinary fields. |
| `prefA*` / `prefB*` | numeric string | Class-A / Class-B preference share breakdowns. |
| `othNumberOfShares`, `othIssuedCash`, `othIssuedNonCash`, `othIssuedNominal`, `othNominalValue`, `othAmountValue` | numeric string | Other share class equivalents. |
| `othA*` / `othB*` | numeric string | Class-A / Class-B other share breakdowns. |

> All monetary and quantity values are returned as **strings** with trailing zeroes (for example `"1135511271.5500"`). Parse with `Number(...)` and re-round before display.

### `rocCompanyOfficerListInfo` — officers list

Path to the array: `rocCompanyOfficerListInfo.rocCompanyOfficerInfos.rocCompanyOfficerInfos[]`.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Full legal name. |
| `idNo` | string | National ID, passport number, or company registration number. |
| `idType` | string code | `"MK"` = MyKad, `"P"` = Passport, `"C"` = Company, `"X"` = Other / unknown. |
| `designationCode` | string code | See [Officer designation codes](#officer-designation-codes). |
| `dob` | ISO date string | Date of birth (when available). |
| `appointmentDate` | ISO date string | Date of formal appointment. May be empty when the registry only carries `startDate`. |
| `startDate` | ISO date string | Effective start date in the role. |
| `address1`, `address2`, `address3` | string | Residential address lines. |
| `town`, `state`, `postcode` | string | Residential city / state code / postcode. |
| `companyNo` | string | Echoes `rocCompanyInfo.companyNo`. |
| `officerInfo` | string | Free-text provider note; usually empty. |

### `rocShareholderListInfo` — shareholders list

Path to the array: `rocShareholderListInfo.rocShareholderInfos.rocShareholderInfos[]`.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Shareholder name (person or entity). |
| `idNo` | string | National ID / passport / company registration number. May be `"-"` for government entities. |
| `idType` | string code | `"MK"` = MyKad, `"P"` = Passport, `"C"` = Company, `"X"` = Other / unknown. |
| `share` | numeric string | Shares held (count or amount in RM, depending on registry). Returned as a string with trailing zeroes. |
| `shareVol` | string | Volume/class indicator when present; often empty. |
| `companyNo` | string | Echoes `rocCompanyInfo.companyNo`. |

### `rocChargesListInfo` — charges list

Path to the array: `rocChargesListInfo.rocChargesInfos.rocChargesInfos[]`.

| Field | Type | Notes |
| --- | --- | --- |
| `chargeNo` | string | Three-digit charge sequence (e.g. `"001"`). |
| `chargeAmount` | numeric string | Principal amount in RM. May be `"0"` or `"0.00"` for unsecured or amount-not-set entries. |
| `chargeMortgageType` | string code | See [Charge mortgage type codes](#charge-mortgage-type-codes). |
| `chargeStatus` | string code | See [Charge status codes](#charge-status-codes). |
| `chargeCreateDate` | ISO date string | Date the charge was created. |
| `chargeCreateDate1` | string | Provider scratch field, generally empty. |
| `form40Date` | ISO date string | Date Form 40 (registration of charge) was filed. |
| `chargeeId` | string | Chargee identifier. May be a numeric ID, free-text label, or party name. |
| `chargeeName` | string | Chargee party name. May be empty when `chargeeId` already contains the full name. |
| `ammendNo` | string | Amendment number when the charge has been varied. **Note: spelled `ammend`, not `amend`, in the provider payload.** |
| `totalOfCharge` | string | Provider summary field; usually empty. |
| `companyNo` | string | Echoes `rocCompanyInfo.companyNo`. |

### `rocBalanceSheetListInfo` — balance sheet list

Path to the array: `rocBalanceSheetListInfo.rocBalanceSheetInfos.rocBalanceSheetInfos[]`. Each entry is one filed financial year.

| Field | Type | Notes |
| --- | --- | --- |
| `financialReportType` | string code | `"Y"` = yearly. |
| `financialYearEndDate` | ISO date string | Period covered. |
| `dateOfTabling` | ISO date string | Date the report was tabled at AGM. |
| `accrualAccType` | string | Accounting policy flag. |
| `currentAsset`, `fixedAsset`, `nonCurrAsset`, `otherAsset` | numeric string | Asset breakdown in RM. |
| `liability`, `longTermLiability`, `nonCurrentLiability` | numeric string | Liability breakdown in RM. |
| `paidUpCapital` | numeric string | Paid-up capital at year end. (Prefer `rocShareCapitalInfo.totalIssued` for current capital.) |
| `reserves`, `sharePremium`, `fundAndReserve`, `fundReserve` | numeric string | Reserves breakdown in RM. |
| `inappropriateProfit` | numeric string | Retained earnings / unappropriated profit. |
| `contigentLiability` | numeric string | Contingent liability disclosure. **Note: spelled `contigent`, not `contingent`, in the provider payload.** |
| `minorityInterest`, `shareAppAccount`, `totalInvestment`, `headOfficeAccount` | numeric string | Other balance-sheet line items. |
| `auditFirmName`, `auditFirmNo` | string | Auditor firm name and registration number. |
| `auditFirmAddress1`, `auditFirmAddress2`, `auditFirmAddress3`, `auditFirmPostcode`, `auditFirmState`, `auditFirmTown` | string | Auditor address; `auditFirmState` uses the [state codes](#malaysian-state-codes). |
| `auditfirmFlag` | string | Provider flag for auditor changes. |
| `branchkeycode`, `companyNo` | string | Identifiers echoed by the provider. |
| `errorMsg`, `infoId`, `successCode` | string | Standard provider response metadata. |

### `rocProfitLossListInfo` — profit & loss list

Path to the array: `rocProfitLossListInfo.rocProfitLossInfos.rocProfitLossInfos[]`. Each entry is one filed financial year.

| Field | Type | Notes |
| --- | --- | --- |
| `financialReportType`, `financialYearEndDate` | string | Period identifiers (see balance sheet block). |
| `accrualAccount` | string | Accounting policy flag. |
| `revenue`, `totalRevenue`, `totalIncome`, `totalExpenditure`, `turnover` | numeric string | Top-line and total figures. |
| `profitBeforeTax`, `profitAfterTax`, `profitShareholder` | numeric string | Bottom-line figures. |
| `surplusBeforeTax`, `surplusAfterTax`, `surplusDeficitBeforeTax`, `surplusDeficitAfterTax` | numeric string | Surplus/deficit variants used by some entity types. |
| `inappropriateProfitBf`, `inappropriateProfitCf` | numeric string | Retained earnings brought-forward / carried-forward. |
| `minorityInterest`, `extraOrdinaryItem`, `grossDividendRate`, `netDividend` | numeric string | Other P&L line items. |
| `others`, `priorAdjustment`, `transferred` | numeric string | Adjustment buckets. |
| `companyNo` | string | Echoes `rocCompanyInfo.companyNo`. |

### `rocBusinessCodeListInfo` — MSIC business codes

Path to the array: `rocBusinessCodeListInfo.rocBusinessCodeInfos.rocBusinessCodeInfos[]`.

| Field | Type | Notes |
| --- | --- | --- |
| `businessCode` | string | MSIC 2008 code (5 digits). |
| `priority` | string | `"1"` = primary, higher numbers are secondary/tertiary activities. |
| `companyNo` | string | Echoes `rocCompanyInfo.companyNo`. |

### `rocDocumentLodgeListInfo` — document lodgement history

Path to the array: `rocDocumentLodgeListInfo.rocDocumentLodgeInfos.rocDocumentLodgeInfos[]`. Each row is a previously lodged filing; use `documents/list` + `documents/image` to retrieve the actual scanned PDFs.

| Field | Type | Notes |
| --- | --- | --- |
| `documentDate` | ISO date string | As-of date for the lodged document. |
| `formTrx` | string | Form type code (e.g. `"557"` = Annual Return, `"24"` = Return of Allotment). |
| `companyNo` | string | Provider may return this empty. |

### Date handling

Dates are returned as ISO 8601 strings, sometimes with **UTC offsets that subtract 8 hours** for Malaysian dates (e.g. `"1910-03-10T17:00:00.000Z"` for an incorporation date that should be read as `1910-03-10`). When extracting just the calendar date, use the **UTC date portion** to avoid timezone-induced day shifts:

```ts
const dateOnly = isoString.slice(0, 10); // "1910-03-10"
```

Do **not** call `new Date(isoString).toLocaleDateString()` without a `timeZone: 'UTC'` option, or the date may shift by a day in Asia/Kuala_Lumpur or other +08:00 timezones.

## Provider Code Reference

The Malaysian registry provider returns several values as single-letter or short codes. This section documents the codes seen in production payloads. Codes not listed here should be passed through verbatim.

### Malaysian state codes

Used by `state` in `rocRegAddressInfo`, `rocBusinessAddressInfo`, all officer entries, and `auditFirmState` in `rocBalanceSheetListInfo`.

| Code | State |
| --- | --- |
| `A` | Johor |
| `B` | Selangor |
| `C` | Pahang |
| `D` | Kelantan |
| `E` | Kedah |
| `F` | Negeri Sembilan |
| `G` | Pulau Pinang |
| `H` | Sabah |
| `J` | Perak |
| `K` | Sarawak |
| `L` | W.P. Labuan |
| `M` | Melaka |
| `N` | Perlis |
| `P` | Terengganu |
| `R` | W.P. Putrajaya |
| `W` | W.P. Kuala Lumpur |

These map to ISO 3166-2 subdivision identifiers as `01` (Johor) through `16` (W.P. Putrajaya). The full ISO 3166-2 codes would be `MY-01`–`MY-16`, but most libraries (including the `country-state-city` npm package used by the admin portal) expose the bare two-digit subdivision part as the canonical `isoCode`. Consumers should translate the SSM letter to the form their state catalogue expects.

### Company type codes

Used by `rocCompanyInfo.companyType`.

| Code | Type |
| --- | --- |
| `S` | Sendirian Berhad (Private — Sdn. Bhd.) |
| `B` | Berhad (Public — Bhd.) |

### Company status codes

Used by `rocCompanyInfo.statusOfCompany` (preferred) and `rocCompanyInfo.companyStatus`.

| Code | Status |
| --- | --- |
| `E` | EXISTING |
| `L` | LIQUIDATED |
| `W` | WOUND UP |
| `D` | DISSOLVED |
| `S` | STRUCK OFF |

### Officer designation codes

Used by `designationCode` in `rocCompanyOfficerListInfo`.

| Code | Designation |
| --- | --- |
| `D` | Director |
| `S` | Secretary |
| `A` | Auditor |
| `M` | Manager |
| `O` | Officer |

### ID type codes

Used by `idType` in officer and shareholder entries.

| Code | ID type |
| --- | --- |
| `MK` | MyKad (Malaysian national IC) |
| `P` | Passport |
| `C` | Company / corporate entity (registration number) |
| `X` | Other / unspecified |

### Charge mortgage type codes

Used by `chargeMortgageType` in `rocChargesListInfo`.

| Code | Type |
| --- | --- |
| `A` | Assignment |
| `F` | Fixed charge |
| `O` | Other |
| `D` | Debenture |
| `L` | Legal |

### Charge status codes

Used by `chargeStatus` in `rocChargesListInfo`.

| Code | Status |
| --- | --- |
| `S` | Subsisting |
| `R` | Released |
| `U` | Discharged |

### Local / foreign company codes

Used by `rocCompanyInfo.localforeignCompany`.

| Code | Meaning |
| --- | --- |
| `L` | Local Malaysian company |
| `F` | Foreign company registered in Malaysia |

### Known provider quirks

These typos and inconsistencies are intentional pass-throughs from the registry provider; consumers must accept them as-is:

- `balaceSheetInfo` / `balaceSheetInfoDesc` (not `balance...`) in `rocCompanyInfo`.
- `contigentLiability` (not `contingent...`) in `rocBalanceSheetListInfo`.
- `ammendNo` (not `amend...`) in `rocChargesListInfo`.
- `currenyNominal` (not `currency...`) in `rocShareCapitalInfo`.
- The double-wrapped list structure (`rocXListInfo.rocXInfos.rocXInfos[]`) is consistent across every list block.
- Numeric values are returned as **strings** with up to 4 decimal places of trailing zeroes (e.g. `"1135511271.5500"`).
- Some envelope-level fields (`successCode: "00"`, `errorMsg: ""`) also appear nested inside list-wrapper objects (e.g. `rocCompanyOfficerListInfo.successCode`) — these refer to the list block, not the overall request.

## Error Response

Errors return JSON with `error` and `message`.

```json
{
  "error": "ENTITY_NOT_FOUND",
  "message": "No matching registry entity was found. No billable TrueSSM™ report was requested."
}
```

Some errors include additional fields, such as credit balance details.

```json
{
  "error": "INSUFFICIENT_CREDITS",
  "message": "Client credit balance exhausted",
  "balance": 100,
  "required_credits": 154
}
```

Failed document pulls can also include `acknowledgement` when the request passed free entity validation and the provider document endpoint was called.

```json
{
  "error": "REGISTRY_UNAVAILABLE",
  "message": "Registry service is unavailable",
  "acknowledgement": {
    "usage_id": "550e8400-e29b-41d4-a716-446655440000",
    "usage_type": "document_image",
    "acknowledged_at": "2026-05-07T06:30:00.000Z",
    "billed_credits": 50,
    "request_id": null
  }
}
```

## Error Codes

| HTTP | Code | Retry? | Meaning |
| --- | --- | --- | --- |
| 400 | `BAD_REQUEST` | No | Request body is invalid JSON, is not an object, is missing a required field, or provider rejected the request as malformed. |
| 401 | `UNAUTHORIZED` | No | API key is missing, invalid, inactive, for another product, or the client/product config is disabled. |
| 402 | `INSUFFICIENT_CREDITS` | No | Client credit balance cannot cover the operation and overdraft is disabled. Top up credits or enable overdraft. |
| 404 | `NOT_FOUND` | No | Unknown TrueSSM™ endpoint path. |
| 404 | `ENTITY_NOT_FOUND` | No | Free entity validation returned no matching entity. No billable provider call was made and no credits were deducted. |
| 400 | `ENTITY_TYPE_MISMATCH` | No | Free entity validation found an entity, but its `entityType` does not match the requested endpoint family. No billable provider call was made and no credits were deducted. |
| 404 | `REPORT_NOT_FOUND` | Usually no | Registry provider did not find the requested report or document. Document operation failures after successful validation are billed and include `acknowledgement`; non-document no-data failures are not billed. |
| 409 | `IDEMPOTENCY_KEY_MISMATCH` | No | Same `Idempotency-Key` was previously used for a different operation or request payload. Use a new key for the new logical pull. |
| 409 | `REQUEST_IN_PROGRESS` | Later | Same `Idempotency-Key` already exists for the same operation/payload, but the original request is still pending. Retry later with the same key or use a new key for a new request. |
| 500 | `INTERNAL_ERROR` | Later | TrueStack could not process the request due to an unexpected internal error. |
| 502 | `PROVIDER_NOT_CONFIGURED` | No | TrueStack provider credentials are not configured for the selected environment. |
| 502 | `REGISTRY_UNAUTHORIZED` | Later | Registry provider rejected TrueStack credentials. TrueStack support should investigate. |
| 502 | `REGISTRY_FORBIDDEN` | Later | Registry provider denied access or subscription/environment access. TrueStack support should investigate. |
| 502 | `REGISTRY_ERROR` | Depends | Registry provider returned an error message in an otherwise parseable response. Document operation failures after successful validation are billed and include `acknowledgement`. |
| 502 | `REGISTRY_UNAVAILABLE` | Yes | Registry provider is unavailable or returned a 5xx response. Document operation failures after successful validation are billed and include `acknowledgement`; retry with the same `Idempotency-Key` to avoid a duplicate pull. |

## Retry Guidance

- Retry network errors, HTTP `502`, and temporary HTTP `500` responses with the same `Idempotency-Key`.
- Do not retry `BAD_REQUEST`, `UNAUTHORIZED`, `INSUFFICIENT_CREDITS`, `ENTITY_NOT_FOUND`, or unknown endpoint `NOT_FOUND` without changing the request or account setup.
- If a retry returns `REQUEST_IN_PROGRESS`, wait and retry with the same key.
- If a retry returns HTTP `200` with `acknowledgement.idempotent = true`, use the returned `data`; the request was already delivered and was not billed again.
- If a retry returns an error with `acknowledgement.idempotent = true`, the failed document pull was already billed and was not billed again.
