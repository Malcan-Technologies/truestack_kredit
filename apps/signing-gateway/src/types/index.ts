// ---- Request types ----

export interface GetCertInfoRequest {
  UserID: string;
}

export interface RequestEmailOTPRequest {
  UserID: string;
  OTPUsage: 'DS' | 'NU';
  EmailAddress?: string;
}

export interface VerifyCertPinRequest {
  UserID: string;
  CertSerialNo: string;
  CertPin: string;
}

export interface OrganisationInfo {
  orgName?: string;
  orgUserDesignation?: string;
  orgUserRegistrationNo?: string;
  orgUserRegistrationType?: string;
  orgAddress?: string;
  orgAddressCity?: string;
  orgAddressState?: string;
  orgAddressPostcode?: string;
  orgAddressCountry?: string;
  orgRegistationNo?: string;
  orgRegistationType?: string;
  orgPhoneNo?: string;
  orgFaxNo?: string;
}

export interface VerificationData {
  verifyDatetime: string;
  verifyMethod: string;
  verifyStatus: string;
  verifyVerifier: string;
}

export interface RequestCertificateRequest {
  UserID: string;
  FullName: string;
  EmailAddress: string;
  MobileNo: string;
  Nationality: string;
  UserType: '1' | '2';
  IDType: 'N' | 'P';
  AuthFactor: string;
  NRICFront?: string;
  NRICBack?: string;
  PassportImage?: string;
  SelfieImage?: string;
  OrganisationInfo?: OrganisationInfo;
  VerificationData?: VerificationData;
}

export interface SignatureInfo {
  pdfInBase64: string;
  visibility: boolean;
  pageNo?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  sigImageInBase64?: string;
  visibleOnEveryPages?: boolean;
  additionalInfo1?: string;
  additionalInfo2?: string;
}

export interface PdfFieldNameValue {
  pdfFieldName: string;
  pdfFieldValue: string;
}

export interface SignPDFRequest {
  UserID: string;
  FullName: string;
  AuthFactor: string;
  SignatureInfo: SignatureInfo;
  FieldListToUpdate?: PdfFieldNameValue[];
}

export interface VerifyPDFSignatureRequest {
  SignedPdfInBase64: string;
}

export interface RequestRevokeCertRequest {
  UserID: string;
  CertSerialNo: string;
  RevokeReason:
    | 'keyCompromise'
    | 'CACompromise'
    | 'affiliationChanged'
    | 'superseded'
    | 'cessationOfOperation';
  RevokeBy: 'Admin' | 'Self';
  AuthFactor: string;
  IDType: 'N' | 'P';
  NRICFront?: string;
  NRICBack?: string;
  PassportImage?: string;
  VerificationData: VerificationData;
}

export interface ResetCertificatePinRequest {
  UserID: string;
  CertSerialNo: string;
  NewPin: string;
}

export interface UpdateEmailAddressRequest {
  UserID: string;
  NewEmailAddress: string;
  EmailOTP: string;
}

export interface RequestSMSOTPRequest {
  UserID: string;
  OTPUsage: 'DS' | 'NU';
  MobileNo?: string;
}

export interface UpdateMobileNoRequest {
  UserID: string;
  NewMobileNo: string;
  SMSOTP: string;
}

// ---- Response types ----

export interface MtsaBaseResponse {
  statusCode: string;
  statusMsg?: string;
  message?: string;
}

export interface GetCertInfoResponse extends MtsaBaseResponse {
  certStatus?: string;
  certValidFrom?: string;
  certValidTo?: string;
  certSerialNo?: string;
  certX509?: string;
  certIssuer?: string;
  certSubjectDN?: string;
}

export interface RequestCertificateResponse extends MtsaBaseResponse {
  certX509?: string;
  certValidFrom?: string;
  certValidTo?: string;
  certSerialNo?: string;
  certRequestID?: string;
  certRequestStatus?: string;
  userID?: string;
}

export interface RequestEmailOTPResponse extends MtsaBaseResponse {}

export interface VerifyCertPinResponse extends MtsaBaseResponse {
  certStatus?: string;
  certPinStatus?: string;
}

export interface SignPDFResponse extends MtsaBaseResponse {
  signedPdfInBase64?: string;
  userCert?: string;
}

export interface PdfSignatureData {
  sigCoverWholeDocument?: boolean;
  sigName?: string;
  sigRevisionNo?: string;
  sigSignerCert?: string;
  sigSignerCertIssuer?: string;
  sigSignerCertStatus?: string;
  sigSignerCertSubject?: string;
  sigStatusValid?: boolean;
  sigTimeStamp?: string;
}

export interface VerifyPDFSignatureResponse extends MtsaBaseResponse {
  totalSignatureInPdf?: number;
  pdfSignatureList?: PdfSignatureData[];
}

export interface RequestRevokeCertResponse extends MtsaBaseResponse {}

export interface ResetCertificatePinResponse extends MtsaBaseResponse {}

export interface UpdateEmailAddressResponse extends MtsaBaseResponse {}

export interface RequestSMSOTPResponse extends MtsaBaseResponse {}

export interface UpdateMobileNoResponse extends MtsaBaseResponse {}
