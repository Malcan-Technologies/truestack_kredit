# MyTrustSigner Agent (MTSA) API Reference

## Purpose

This document defines the SOAP API contract for the MyTrustSigner Agent (MTSA), a proprietary Java/Tomcat service provided by MSC Trustgate for PKI (Public Key Infrastructure) digital signing operations in Malaysia.

This reference is extracted from the official Trustgate ICD specification (v1.0, dated 19-Jan-2026) and validated against the working `creditxpress_aws` implementation. It serves as the canonical API contract for building the Signing Gateway in `truestack_kredit`.

---

## Service Overview

| Property | Value |
|----------|-------|
| Provider | MSC Trustgate Sdn. Bhd. |
| Protocol | SOAP 1.1 / 1.2 over HTTP |
| Runtime | Apache Tomcat 9 on JDK 17 |
| Container Port | **8080** |
| Authentication | HTTP headers (`Username` / `Password`) per request |
| Certificate Authority | MyTrust Class 3 ECC (Malaysia Licensed CA) |
| SOAP Namespace | `http://mtsa.msctg.com/` |

## Container Variants

| Variant | Container Image | WSDL Path | Purpose |
|---------|-----------------|-----------|---------|
| Pilot | `mtsa-pilot:<version>` | `/MTSAPilot/MyTrustSignerAgentWSAPv2?wsdl` | Development and integration |
| Production | `mtsa:<version>` | `/MTSA/MyTrustSignerAgentWSAPv2?wsdl` | UAT and live environment |

Full WSDL URLs:

```
Pilot:      http://mtsa:8080/MTSAPilot/MyTrustSignerAgentWSAPv2?wsdl
Production: http://mtsa:8080/MTSA/MyTrustSignerAgentWSAPv2?wsdl
```

## Authentication

All SOAP requests require HTTP header-based authentication:

```
Username: <mtsa_soap_username>
Password: <mtsa_soap_password>
```

Credentials are issued per-client by Trustgate (separate credentials for pilot and production). They are plain HTTP request headers applied to every SOAP call — **not** SOAP WS-Security headers.

Credentials are stored in the on-prem `.env` file as `MTSA_SOAP_USERNAME` and `MTSA_SOAP_PASSWORD`. See `docs/architecture_plan.md` Section 12.13.

## Common Response Format

All operations return a response containing at minimum:

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = success, anything else = error |
| `statusMsg` | string | Human-readable status message |

Some operations wrap the response inside a `return` element. The Signing Gateway must handle both structures:

```
// Direct fields
{ statusCode: "000", statusMsg: "Success", ... }

// Wrapped in return
{ return: { statusCode: "000", statusMsg: "Success", ... } }
```

---

## Operations

### 1. RequestCertificate

Enrolls a user for a roaming digital certificate via the Certificate Authority.

**SOAP Method:** `RequestCertificate`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `UserID` | string(12) | M | 12-digit Malaysian NRIC (no dashes) or passport number. Example: `770908012232` |
| `FullName` | string(100) | M | Full legal name as per MyKad or passport |
| `EmailAddress` | string(50) | M | User email address |
| `MobileNo` | string(15) | M | Mobile number (format: `+60123456789`) |
| `Nationality` | string(2) | M | Two-letter country code. `MY` = Malaysian, `ZZ` = non-Malaysian |
| `UserType` | string(1) | M | `1` = External (borrower), `2` = Internal (authorised signatory/attestator) |
| `IDType` | string(1) | M | `N` = Malaysian NRIC, `P` = Passport |
| `AuthFactor` | string(6) for OTP, string(8) for PIN | M | UserType 1: Email OTP (6 digits). UserType 2: PIN (up to 8 chars) |
| `NRICFront` | string (base64) | M/O | MyKad front image (JPEG/PNG). Mandatory if `IDType=N` |
| `NRICBack` | string (base64) | M/O | MyKad back image (JPEG/PNG). Mandatory if `IDType=N` |
| `PassportImage` | string (base64) | M/O | Passport image (JPEG/PNG). Mandatory if `IDType=P` |
| `SelfieImage` | string (base64) | M | Selfie photo of the user |
| `OrganisationInfo` | object | M/O | Organisation details (see below). Optional for UserType 1, mandatory for UserType 2 |
| `VerificationData` | object | M/O | Identity verification details (see below). Optional for UserType 1 (external), mandatory for UserType 2 (internal) |

**OrganisationInfo fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `orgName` | string | | Organisation name |
| `orgUserDesignation` | string | | User's role/title or regulated professional designation |
| `orgUserRegistrationNo` | string | | User's staff/employee ID, registration number, or ID number |
| `orgUserRegistrationType` | string | Required if `orgUserRegistrationNo` specified | `PAS` = passport-based, `IDC` = MyKad-based |
| `orgAddress` | string | | Street address |
| `orgAddressCity` | string | | City |
| `orgAddressState` | string | | State |
| `orgAddressPostcode` | string | | Postcode |
| `orgAddressCountry` | string | | Two-letter country code (default `MY`) |
| `orgRegistationNo` | string | | Organisation registration number |
| `orgRegistationType` | string | | Registration type: `NTRMY`, `IRB`, `RMC`, `CIDB`, `BAM`, `GOV`, `GOVSUB`, `INT`, `LEI` |
| `orgPhoneNo` | string | M | Organisation telephone |
| `orgFaxNo` | string | O | Organisation fax |

**VerificationData fields:**

| Field | Type | Description |
|-------|------|-------------|
| `verifyStatus` | string(100) | Outcome of the identity verification (establishes linkage between claimed identity and real-life existence per DSA 1997) |
| `verifyDatetime` | string | Date/time of verification. Format: `yyyy-MM-dd HH:mm:ss`. Example: `2024-05-19 11:01:12` |
| `verifyVerifier` | string(100) | Individual, entity, or machine that conducted verification |
| `verifyMethod` | string(100) | Method used: (a) Manual face-to-face, (b) Manual with biometric, (c) Secure automated self-service with biometric, (d) e-KYC per BNM guidelines |

#### Response

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = success |
| `statusMsg` | string | Status message |
| `certX509` | string | Certificate in X.509 format (null if unsuccessful) |
| `certValidFrom` | string | Certificate validity start (null if unsuccessful) |
| `certValidTo` | string | Certificate validity end (null if unsuccessful) |
| `certSerialNo` | string | Certificate serial number (null if unsuccessful) |
| `certRequestID` | string | Enrollment request tracking ID (null if unsuccessful) |
| `certRequestStatus` | string | Enrollment status (null if unsuccessful) |
| `userID` | string | Echo of the submitted user ID |

#### SOAP Envelope

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:RequestCertificate>
      <UserID></UserID>
      <FullName></FullName>
      <EmailAddress></EmailAddress>
      <MobileNo></MobileNo>
      <Nationality></Nationality>
      <UserType></UserType>
      <IDType></IDType>
      <AuthFactor></AuthFactor>
      <NRICFront></NRICFront>
      <NRICBack></NRICBack>
      <SelfieImage></SelfieImage>
      <PassportImage></PassportImage>
      <OrganisationInfo>
        <orgAddress></orgAddress>
        <orgAddressCity></orgAddressCity>
        <orgAddressCountry></orgAddressCountry>
        <orgAddressPostcode></orgAddressPostcode>
        <orgAddressState></orgAddressState>
        <orgFaxNo></orgFaxNo>
        <orgName></orgName>
        <orgPhoneNo></orgPhoneNo>
        <orgRegistationNo></orgRegistationNo>
        <orgRegistationType></orgRegistationType>
        <orgUserDesignation></orgUserDesignation>
        <orgUserRegistrationNo></orgUserRegistrationNo>
        <orgUserRegistrationType></orgUserRegistrationType>
      </OrganisationInfo>
      <VerificationData>
        <verifyDatetime></verifyDatetime>
        <verifyMethod></verifyMethod>
        <verifyStatus></verifyStatus>
        <verifyVerifier></verifyVerifier>
      </VerificationData>
    </mtsa:RequestCertificate>
  </soapenv:Body>
</soapenv:Envelope>
```

---

### 2. GetCertInfo

Retrieves the current status and details of a user's digital certificate.

**SOAP Method:** `GetCertInfo`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `UserID` | string | M | Malaysian NRIC or passport number |

#### Response

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = success |
| `statusMsg` | string | Status message |
| `certStatus` | string | Certificate status: `Valid`, `Expired`, `Revoked` |
| `certValidFrom` | string | Validity start. Example: `2020-07-01 08:00:00` |
| `certValidTo` | string | Validity end. Example: `2020-08-29 07:59:59` |
| `certSerialNo` | string | Certificate serial number |
| `certX509` | string | Certificate in base64 format |
| `certIssuer` | string | Certificate issuer DN |
| `certSubjectDN` | string | Certificate subject DN |

#### SOAP Envelope

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:GetCertInfo>
      <UserID></UserID>
    </mtsa:GetCertInfo>
  </soapenv:Body>
</soapenv:Envelope>
```

---

### 3. RequestEmailOTP

Requests an OTP to be sent to the user's registered email. OTP is used as the `AuthFactor` for subsequent operations.

**SOAP Method:** `RequestEmailOTP`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `UserID` | string | M | Malaysian NRIC or passport number |
| `OTPUsage` | string | M | `DS` = digital signing, `NU` = new enrollment / email update / revocation |
| `EmailAddress` | string | M/O | Mandatory when `OTPUsage = "NU"` (enrollment or email update) |

#### Response

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = OTP sent successfully |
| `statusMsg` | string | Status message |

#### SOAP Envelope

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:RequestEmailOTP>
      <UserID></UserID>
      <EmailAddress></EmailAddress>
      <OTPUsage></OTPUsage>
    </mtsa:RequestEmailOTP>
  </soapenv:Body>
</soapenv:Envelope>
```

---

### 4. VerifyCertPin

Verifies the user's certificate PIN before signing (used for internal/UserType 2 signatories).

**SOAP Method:** `VerifyCertPin`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `UserID` | string(12) | M | Malaysian NRIC or passport number |
| `CertSerialNo` | string(50) | M | Certificate serial number |
| `CertPin` | string(8) | M | Certificate PIN |

#### Response

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = success |
| `statusMsg` | string | Status message |
| `certStatus` | string | `Valid` or `Invalid` |
| `certPinStatus` | string | `Valid` or `Invalid` |

PIN is considered verified only when `statusCode = "000"` **AND** `certPinStatus = "Valid"`.

#### SOAP Envelope

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:VerifyCertPin>
      <UserID></UserID>
      <CertPin></CertPin>
      <CertSerialNo></CertSerialNo>
    </mtsa:VerifyCertPin>
  </soapenv:Body>
</soapenv:Envelope>
```

---

### 5. SignPDF

Signs a PDF document using the user's PKI certificate. Optionally fills in PDF form fields before signing.

**SOAP Method:** `SignPDF`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `UserID` | string(12) | M | Malaysian NRIC or passport number |
| `FullName` | string(100) | M | Full name as per MyKad or passport |
| `AuthFactor` | string(6) for OTP, string(8) for PIN | M | Email OTP (UserType 1) or PIN (UserType 2) |
| `SignatureInfo` | object | M | PDF and signature placement details (see below) |
| `FieldListToUpdate` | array of `PdfFieldNameValue` | M | PDF form fields to fill before signing (can be empty list) |

**SignatureInfo fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pdfInBase64` | string (base64) | M | The PDF document to sign |
| `visibility` | boolean | M | `true` = visible signature, `false` = invisible |
| `pageNo` | integer | M/O | Page number for visible signature (1-based). Mandatory if visibility=true |
| `x1` | integer | M/O | Lower-left X coordinate. Mandatory if visibility=true |
| `y1` | integer | M/O | Lower-left Y coordinate. Mandatory if visibility=true |
| `x2` | integer | M/O | Upper-right X coordinate. Mandatory if visibility=true |
| `y2` | integer | M/O | Upper-right Y coordinate. Mandatory if visibility=true |
| `sigImageInBase64` | string (base64) | O | Signature appearance image |
| `visibleOnEveryPages` | boolean | O | If `true`, signature appears on every page |
| `additionalInfo1` | string | O | Additional text in signature (e.g. IP address, user designation) |
| `additionalInfo2` | string | O | Additional text in signature (e.g. department name) |

**PdfFieldNameValue fields:**

| Field | Type | Description |
|-------|------|-------------|
| `pdfFieldName` | string | Name of the PDF form field |
| `pdfFieldValue` | string | Value to set (supports auto-fill templates, see below) |

**Auto-fill templates for `pdfFieldValue`:**

| Template | Description | Example Output |
|----------|-------------|----------------|
| `CURR_DATE,F=DDMMMMYYYY,D=SPACE` | Current date | `21 MARCH 2021` |
| `CURR_DATE,F=DDMMMYYYY,D=FSLASH` | Current date | `21/MAR/2021` |
| `CURR_DATE,F=DDMMYYYY,D=DASH` | Current date | `21-03-2021` |
| `CURR_DATE,F=YYYYMMMMDD,D=SPACE` | Current date | `2021 MARCH 21` |
| `CURR_DATE,F=YYYYMMMDD,D=DASH` | Current date | `2021-MAR-21` |
| `CURR_DATE,F=YYYYMMDD,D=FSLASH` | Current date | `2021/03/21` |
| `SIGNER_FULLNAME` | Signer's full name | (auto-filled) |
| `SIGNER_ID` | Signer's UserID (NRIC/passport) | (auto-filled) |

#### Response

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = success |
| `statusMsg` | string | Status message |
| `signedPdfInBase64` | string (base64) | The signed PDF document |
| `userCert` | string | Signer's certificate in X.509 format |

#### SOAP Envelope

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:SignPDF>
      <UserID></UserID>
      <FullName></FullName>
      <AuthFactor></AuthFactor>
      <SignatureInfo>
        <pageNo></pageNo>
        <pdfInBase64></pdfInBase64>
        <sigImageInBase64></sigImageInBase64>
        <visibility></visibility>
        <visibleOnEveryPages></visibleOnEveryPages>
        <x1></x1>
        <x2></x2>
        <y1></y1>
        <y2></y2>
        <additionalInfo1></additionalInfo1>
        <additionalInfo2></additionalInfo2>
      </SignatureInfo>
      <!--Zero or more repetitions:-->
      <FieldListToUpdate>
        <pdfFieldName></pdfFieldName>
        <pdfFieldValue></pdfFieldValue>
      </FieldListToUpdate>
    </mtsa:SignPDF>
  </soapenv:Body>
</soapenv:Envelope>
```

---

### 6. VerifyPDFSignature

Verifies all digital signatures embedded in a signed PDF document.

**SOAP Method:** `VerifyPDFSignature`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `SignedPdfInBase64` | string (base64) | M | The signed PDF to verify |

#### Response

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = all signatures valid |
| `statusMsg` | string | Status message |
| `totalSignatureInPdf` | integer | Number of signatures found in the document |
| `pdfSignatureList` | array of `PdfSignatureData` | Per-signature detail (see below) |

**PdfSignatureData fields:**

| Field | Type | Description |
|-------|------|-------------|
| `sigCoverWholeDocument` | boolean | Whether the signature covers the entire document |
| `sigName` | string | Digital signature name in the PDF |
| `sigRevisionNo` | string | Signature revision info |
| `sigSignerCert` | string | Signer's certificate in X.509 format |
| `sigSignerCertIssuer` | string | Signer's certificate issuer DN |
| `sigSignerCertStatus` | string | Signer's certificate status |
| `sigSignerCertSubject` | string | Signer's certificate subject DN |
| `sigStatusValid` | boolean | `true` = signature is valid, `false` = invalid |
| `sigTimeStamp` | string | Signature timestamp. Example: `2020-06-22 15:39:37.00` |

#### SOAP Envelope

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:VerifyPDFSignature>
      <SignedPdfInBase64></SignedPdfInBase64>
    </mtsa:VerifyPDFSignature>
  </soapenv:Body>
</soapenv:Envelope>
```

---

### 7. RequestRevokeCert

Revokes a user's digital certificate.

**SOAP Method:** `RequestRevokeCert`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `UserID` | string(12) | M | Malaysian NRIC or passport number |
| `CertSerialNo` | string(50) | M | Serial number of cert to revoke |
| `RevokeReason` | string(100) | M | Reason code (see Revocation Definitions below) |
| `RevokeBy` | string | M | `Admin` = admin-initiated, `Self` = user-initiated |
| `AuthFactor` | string(6) for OTP, string(8) for PIN | M | UserType 1: Email OTP, UserType 2: PIN |
| `IDType` | string(1) | M | `N` = Malaysian NRIC, `P` = Passport |
| `NRICFront` | string (base64) | M/O | Mandatory if `IDType=N` |
| `NRICBack` | string (base64) | M/O | Mandatory if `IDType=N` |
| `PassportImage` | string (base64) | M/O | Mandatory if `IDType=P` |
| `VerificationData` | object | M | Same structure as `RequestCertificate` |

#### Response

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = success |
| `statusMsg` | string | Status message |

#### SOAP Envelope

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:RequestRevokeCert>
      <UserID></UserID>
      <CertSerialNo></CertSerialNo>
      <RevokeReason></RevokeReason>
      <RevokeBy></RevokeBy>
      <IDType></IDType>
      <AuthFactor></AuthFactor>
      <NRICFront></NRICFront>
      <NRICBack></NRICBack>
      <PassportImage></PassportImage>
      <VerificationData>
        <verifyDatetime></verifyDatetime>
        <verifyMethod></verifyMethod>
        <verifyStatus></verifyStatus>
        <verifyVerifier></verifyVerifier>
      </VerificationData>
    </mtsa:RequestRevokeCert>
  </soapenv:Body>
</soapenv:Envelope>
```

---

### 8. UpdateEmailAddress

Updates a user's email address registered with the certificate system.

**SOAP Method:** `UpdateEmailAddress`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `UserID` | string | M | Malaysian NRIC number |
| `NewEmailAddress` | string | M | New email address |
| `EmailOTP` | string | M | OTP received by user (request via `RequestEmailOTP` with `OTPUsage=NU`) |

#### Response

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = success |
| `statusMsg` | string | Status message |

#### SOAP Envelope

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:UpdateEmailAddress>
      <UserID></UserID>
      <NewEmailAddress></NewEmailAddress>
      <EmailOTP></EmailOTP>
    </mtsa:UpdateEmailAddress>
  </soapenv:Body>
</soapenv:Envelope>
```

---

### 9. RequestSMSOTP

Requests an OTP to be sent to the user's registered mobile number via SMS. OTP is used as the `AuthFactor` for subsequent operations. Functionally equivalent to `RequestEmailOTP` but delivered via SMS.

**SOAP Method:** `RequestSMSOTP`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `UserID` | string | M | Malaysian NRIC or passport number |
| `OTPUsage` | string | M | `DS` = digital signing, `NU` = new enrollment / mobile update / revocation |
| `MobileNo` | string | M/O | Mandatory when `OTPUsage = "NU"` (enrollment or mobile update) |

#### Response

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = OTP sent successfully |
| `statusMsg` | string | Status message |

#### SOAP Envelope

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:RequestSMSOTP>
      <UserID></UserID>
      <MobileNo></MobileNo>
      <OTPUsage></OTPUsage>
    </mtsa:RequestSMSOTP>
  </soapenv:Body>
</soapenv:Envelope>
```

---

### 10. UpdateMobileNo

Updates a user's mobile number registered with the certificate system.

**SOAP Method:** `UpdateMobileNo`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `UserID` | string | M | Malaysian NRIC or passport number |
| `NewMobileNo` | string | M | New mobile number (format: `+60123456789`) |
| `SMSOTP` | string | M | OTP received by user (request via `RequestSMSOTP` with `OTPUsage=NU`) |

#### Response

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = success |
| `statusMsg` | string | Status message |

#### SOAP Envelope

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:UpdateMobileNo>
      <UserID></UserID>
      <NewMobileNo></NewMobileNo>
      <SMSOTP></SMSOTP>
    </mtsa:UpdateMobileNo>
  </soapenv:Body>
</soapenv:Envelope>
```

---

### 11. ResetCertificatePin

Resets the certificate PIN for a user (admin operation).

**SOAP Method:** `ResetCertificatePin`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `UserID` | string(12) | M | Malaysian NRIC or passport number |
| `CertSerialNo` | string(50) | M | Certificate serial number |
| `NewPin` | string(8) | M | New PIN value (minimum 8 characters) |

#### Response

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | `"000"` = success |
| `statusMsg` | string | Status message |

#### SOAP Envelope

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:ResetCertificatePin>
      <UserID></UserID>
      <CertSerialNo></CertSerialNo>
      <NewPin></NewPin>
    </mtsa:ResetCertificatePin>
  </soapenv:Body>
</soapenv:Envelope>
```

---

## Signature Coordinate System

PDF signatures use a point-based coordinate system where the origin `(0,0)` is at the **lower-left** corner of the page.

```
         (0, 792)                    (612, 792)
            ┌──────────────────────────┐
            │                          │
            │      ┌────────┐          │
            │      │ x1,y2  │ x2,y2    │
            │      │  SIG   │          │
            │      │ x1,y1  │ x2,y1    │
            │      └────────┘          │
            │                          │
            └──────────────────────────┘
         (0, 0)                      (612, 0)
```

| Property | Value |
|----------|-------|
| Unit | Points (1 inch = 72 points) |
| US Letter | 612 x 792 points (8.5" x 11") |
| A4 | 595 x 842 points (8.27" x 11.69") |
| Origin | Lower-left corner `(0, 0)` |
| Signature box | Defined by `(x1, y1)` lower-left to `(x2, y2)` upper-right |

---

## Status Code Reference

### Common Errors (All Operations)

| Code | Message |
|------|---------|
| `WS100` | Failed to initiate API |
| `WS101` | Read config failed |
| `WS102` | Invalid API credential |
| `WS103` | Credential file not found |
| `WS104` | Missing required parameters |
| `WS105` | Failed to get Project Profile |
| `WS106` | Failed to auto renew cert |
| `WS110` | Username value is missing from Web Service Header |
| `WS111` | Username is missing from Web Service Header |
| `WS112` | Password value is missing from Web Service Header |
| `WS113` | Password is missing from Web Service Header |
| `WS114` | Error in processing Web Service Header |
| `WS115` | MyTrustSigner Service returns error: `<message>` |
| `WS116` | No permission to execute this API function |
| `WS117` | Error in initiating API execution: `<message>` |

### SignPDF

| Code | Message |
|------|---------|
| `000` | Success |
| `DS002` | Failed to call signPDF function |
| `DS100` | Failed to read digital signing config |
| `DS101` | Missing required parameter for digital signing |
| `DS102` | Failed to read user cert |
| `DS103` | Cert has expired |
| `DS104` | Cert has been revoked |
| `DS105` | Cert not found |
| `DS106` | Failed to auto renew expired cert |
| `DS107` | Invalid PDF form field name |
| `DS110` | Failed to prepare hash |
| `DS111` | Failed to process hash |
| `DS120` | Failed to embed signature into pdf |
| `DS121` | Failed to generate signed pdf file |
| `DS122` | Failed to create Base64 String from signed pdf file |
| `DS130` | Failed to read cert from X509 |
| `DS131` | Failed to create external signature |
| `DS132` | Failed to embed signature into pdf |
| `DS133` | Certificate type is not supported |
| `DS134` | Cannot define certificate type |
| `DS135` | Error on getting info from Timestamping Authority Service |

#### OTP-Related Errors (during SignPDF)

| Code | Message |
|------|---------|
| `DS112` | Invalid OTP — check the code and try again |
| `DS113` | OTP has expired — request a new OTP |
| `DS114` | OTP verification failed — request a new OTP |

### VerifyPDFSignature

| Code | Message |
|------|---------|
| `VS100` | Missing pdf path |
| `VS101` | Invalid pdf file path |
| `VS102` | IOException Error: `<message>` |
| `VS103` | GeneralSecurityException Error: `<message>` |
| `VS104` | Exceptions Error: `<message>` |
| `VS110` | Date parse error |
| `VS111` | No signature found in document |

### GetCertInfo

| Code | Message |
|------|---------|
| `000` | Success |
| `GC100` | Cert not found |
| `GC101` | Failed to read user's digital certificate |
| `GC102` | Error while reading user's digital certificate: `<message>` |
| `GC103` | Error while processing user's digital certificate info |
| `GC104` | Cert has been revoked |
| `GC200` | Get Cert detail failed |

### RequestCertificate

| Code | Message |
|------|---------|
| `000` | Success |
| `AP100` | Certificate auto-enrolment failed |
| `AP101` | Missing required parameter: `<name>` |
| `AP102` | Invalid parameter length: `<name>` |
| `AP103` | Invalid value for UserType (must be 1 or 2) |
| `AP104` | Error in parameter validation: `<name>` |
| `AP105` | Invalid value for Nationality (must be `MY` or `ZZ`) |
| `AP106` | Invalid validator value: `<name>` |
| `AP107` | Invalid parameter format: `<name>` |
| `AP108` | Invalid image file: `<name>` |
| `AP109` | Invalid base64 string: `<name>` |
| `AP110` | Invalid value for IDType (must be `P` or `N`) |
| `AP111` | User already has a certificate |
| `AP112` | Invalid AuthFactor |
| `AP113` | AuthFactor has expired |
| `AP114` | AuthFactor validation failed |
| `AP115` | EKYC Error: `<message>` |
| `AP120` | MyTrustID Service returns error: `<message>` |
| `AP121` | User already has an active certificate request |
| `AP122` | Document size is bigger than the limit |
| `AP123` | No document to upload |

### RequestRevokeCert

| Code | Message |
|------|---------|
| `000` | Success |
| `RV100` | Certificate auto-revocation failed |
| `RV101` | Missing required parameter: `<name>` |
| `RV102` | Invalid parameter length: `<name>` |
| `RV103` | Invalid value for RevokeBy (must be `Admin` or `Self`) |
| `RV104` | Error in parameter validation: `<name>` |
| `RV105` | Manual approval is required |
| `RV106` | Invalid validator value: `<name>` |
| `RV107` | Invalid parameter format: `<name>` |
| `RV108` | Invalid image file: `<name>` |
| `RV109` | Invalid base64 string: `<name>` |
| `RV110` | Invalid value for IDType (must be `P` or `N`) |
| `RV111` | Invalid certificate status: `<status>` |
| `RV112` | Invalid AuthFactor |
| `RV113` | AuthFactor has expired |
| `RV114` | AuthFactor validation failed |
| `RV115` | Failed to retrieve certificate request record |
| `RV116` | User has no completed certificate request record |
| `RV117` | MyTrustID Service returns error: `<message>` |
| `RV118` | Document size is bigger than the limit |
| `RV119` | No document to upload |
| `RV120` | Failed to revoke: `<message>` |

### RequestEmailOTP

| Code | Message |
|------|---------|
| `000` | Success |
| `OT100` | Failed to generate OTP: `<message>` |

### RequestSMSOTP

| Code | Message |
|------|---------|
| `000` | Success |
| `OT100` | Failed to generate OTP: `<message>` |

### UpdateEmailAddress

| Code | Message |
|------|---------|
| `000` | Success |
| `UI100` | Failed to update: `<message>` |

### UpdateMobileNo

| Code | Message |
|------|---------|
| `000` | Success |
| `UI100` | Failed to update: `<message>` (shares `UI` prefix with UpdateEmailAddress) |

### VerifyCertPin

| Code | Message |
|------|---------|
| `000` | Success |
| `VP100` | Failed to verify PIN: `<message>` |
| `VP101` | User has no valid certificate |
| `VP102` | The certificate has not yet been activated |
| `VP103` | Failed to read user's digital certificate |
| `VP104` | Certificate PIN is invalid |
| `VP105` | Invalid certificate serial number |

### ResetCertificatePin

| Code | Message |
|------|---------|
| `000` | Success |
| `RP101` | MyTrustSigner Reset Pin Service returns error: `<message>` |
| `RP102` | Error in reset certificate pin - Cert has been revoked |
| `RP103` | Minimum 8 (PIN length too short) |
| `RP104` | Failed to reset PIN: `<message>` |

---

## Revocation Reason Definitions

As defined in RFC 5280 Section 5.3.1 and MSC Trustgate CPS Section 7.2:

| Reason | Definition |
|--------|------------|
| `keyCompromise` | The private key associated with the certificate has been compromised or is in possession of an unauthorized individual (e.g. laptop stolen, smart card lost) |
| `CACompromise` | The CA's private key has been compromised. All certificates signed by that key are considered revoked |
| `affiliationChanged` | The user has terminated their relationship with the organization in the certificate's Distinguished Name (e.g. resignation, termination) |
| `superseded` | A replacement certificate has been issued and the reason does not fall under previous codes (e.g. smart card failure, forgotten token password, legal name change) |
| `cessationOfOperation` | The CA is being decommissioned and will no longer be used |

---

## Network Requirements

MTSA needs outbound HTTPS access to Trustgate PKI servers:

| Service | Purpose |
|---------|---------|
| MSCTG CRL/OCSP | Certificate revocation checking |
| MSCTG Timestamping Authority | Trusted timestamp for signatures |
| MSCTG CA System | Certificate issuance and management |

MTSA must **never** be exposed to external networks. It should only be reachable from the Signing Gateway on the internal Docker network.

---

## Hardware and Software Requirements

### Software

| Component | Requirement |
|-----------|-------------|
| Java | JDK 17 (latest patch) |
| Application Server | Apache Tomcat 9 (latest patch) |
| OS | Linux recommended (CentOS, RHEL 6/7 x64). Windows supported but not recommended |

### Hardware (Minimum)

| Resource | Requirement |
|----------|-------------|
| RAM | 16 GB |
| Disk | 20 GB |
| CPU | 64-bit, single core 3GHz+ or dual core 2GHz+ |

---

## Runtime Notes

- MTSA listens on port **8080** (HTTP, not HTTPS — TLS terminates at the Signing Gateway or reverse proxy)
- Container timezone should be set to `Asia/Kuala_Lumpur` (`TZ=Asia/Kuala_Lumpur`)
- Container is **stateless** — no persistent volumes needed for MTSA itself
- Container images are provided by Trustgate as Docker tarballs (`.tar` files), loaded via `docker load -i`
- MTSA needs to communicate with Trustgate PKI servers for all certificate and signing operations — there is no offline mode
- SOAP client libraries should handle retry with backoff for transient network failures to Trustgate
- Internal users (UserType 2) must be pre-registered with Trustgate via a user list before certificate enrollment

---

## Typical Signing Flows

### Borrower (UserType 1 — External, Email OTP)

1. **Certificate Check** — `GetCertInfo` to check if borrower already has a valid certificate
2. **Certificate Enrollment** (if needed):
   a. `RequestEmailOTP` with `OTPUsage = "NU"` and `EmailAddress` to send enrollment OTP
   b. User enters OTP
   c. `RequestCertificate` with the OTP as `AuthFactor`, identity documents, and KYC images
3. **Signing**:
   a. `RequestEmailOTP` with `OTPUsage = "DS"` (no `EmailAddress` — MTSA uses registered email)
   b. User enters OTP
   c. `SignPDF` with the OTP as `AuthFactor`, the PDF in base64, signature image, and coordinates
   d. Receive `signedPdfInBase64` in the response
4. **Verification** (optional) — `VerifyPDFSignature` to confirm the signature is valid and covers the whole document

### Internal Staff (UserType 2 — Internal, PIN-based)

1. **Certificate Check** — `GetCertInfo` to check if staff member already has a valid certificate
2. **Certificate Enrollment** (if needed):
   a. `RequestEmailOTP` with `OTPUsage = "NU"` and `EmailAddress` to send enrollment OTP
   b. Staff enters OTP
   c. `RequestCertificate` with PIN as `AuthFactor`, UserType `2`, identity documents, `OrganisationInfo`, and `VerificationData`
3. **Signing** (triggered from `backend_pro`, not directly from frontend):
   a. `VerifyCertPin` to validate the staff member's PIN
   b. `SignPDF` with the PIN as `AuthFactor`, the already-signed PDF (from borrower step), signature image, and role-specific coordinates
   c. Each internal signer (company rep, then witness) signs sequentially, producing a new PDF version each time

---

## Signing Gateway REST API Mapping

The Signing Gateway exposes MTSA operations as REST endpoints. All endpoints require `X-API-Key` header. All responses are enriched with `success: boolean` and `errorDescription: string` (on failure).

| Gateway Endpoint | MTSA Operation | Notes |
|------------------|----------------|-------|
| `POST /api/cert/info` | GetCertInfo | |
| `POST /api/cert/enroll` | RequestCertificate | |
| `POST /api/cert/revoke` | RequestRevokeCert | |
| `POST /api/cert/verify-pin` | VerifyCertPin | |
| `POST /api/cert/reset-pin` | ResetCertificatePin | |
| `POST /api/otp/request-email` | RequestEmailOTP | Also available at `/api/otp/request` (alias) |
| `POST /api/otp/request-sms` | RequestSMSOTP | |
| `POST /api/sign` | SignPDF | Returns signed PDF in response |
| `POST /api/sign-and-store` | SignPDF + local storage | Signs and persists the PDF on-prem in `/signed-docs/`. Returns document metadata including file path. |
| `POST /api/verify` | VerifyPDFSignature | |
| `POST /api/email/update` | UpdateEmailAddress | |
| `POST /api/mobile/update` | UpdateMobileNo | |
| `GET /api/files/:path` | (file serving) | Serves signed PDFs from on-prem storage. Auth required. |
| `GET /health` | (connectivity check) | No auth required |

**HTTP Status Convention:**

| HTTP Status | Meaning |
|-------------|---------|
| `200` | MTSA responded (check `success` and `statusCode` in body) |
| `400` | Missing required Gateway-level parameters |
| `401` | Invalid or missing `X-API-Key` |
| `502` | MTSA unreachable or SOAP transport error |

---

## Source

- **Trustgate ICD:** `docs/ANDAS-CAPITAL-MyTrustSigner API-TechSpec-ICD-v1.0-2.pdf` (v1.0, 19-Jan-2026)
- **Previous Implementation:** `creditxpress_aws/on-prem/signing-orchestrator/src/services/MTSAClient.ts`
- **Previous Type Definitions:** `creditxpress_aws/on-prem/signing-orchestrator/src/types/index.ts`
- **Current Implementation:** `apps/signing-gateway/src/services/MTSAClient.ts` — validated against MTSA pilot container for both UserType 1 (external/borrower) and UserType 2 (internal/staff) operations
