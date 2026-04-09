import * as soap from 'soap';
import { config, getMtsaWsdlUrl } from '../config.js';
import type {
  GetCertInfoRequest,
  GetCertInfoResponse,
  RequestCertificateRequest,
  RequestCertificateResponse,
  RequestEmailOTPRequest,
  RequestEmailOTPResponse,
  RequestSMSOTPRequest,
  RequestSMSOTPResponse,
  VerifyCertPinRequest,
  VerifyCertPinResponse,
  SignPDFRequest,
  SignPDFResponse,
  VerifyPDFSignatureRequest,
  VerifyPDFSignatureResponse,
  RequestRevokeCertRequest,
  RequestRevokeCertResponse,
  ResetCertificatePinRequest,
  ResetCertificatePinResponse,
  UpdateEmailAddressRequest,
  UpdateEmailAddressResponse,
  UpdateMobileNoRequest,
  UpdateMobileNoResponse,
} from '../types/index.js';

let soapClient: soap.Client | null = null;

const SOAP_HEADERS = {
  Username: config.mtsa.soapUsername,
  Password: config.mtsa.soapPassword,
};

function getSoapOptions(): soap.IOptions {
  return {
    wsdl_headers: SOAP_HEADERS,
    wsdl_options: { timeout: 30000 },
    forceSoap12Headers: false,
  };
}

export async function getClient(): Promise<soap.Client> {
  if (soapClient) return soapClient;

  const wsdlUrl = getMtsaWsdlUrl();
  console.log(`[MTSAClient] Connecting to WSDL: ${wsdlUrl}`);

  soapClient = await soap.createClientAsync(wsdlUrl, getSoapOptions());
  soapClient.addHttpHeader('Username', SOAP_HEADERS.Username);
  soapClient.addHttpHeader('Password', SOAP_HEADERS.Password);

  console.log('[MTSAClient] SOAP client initialized');
  return soapClient;
}

export function resetClient(): void {
  soapClient = null;
}

/**
 * Normalise MTSA responses — some ops wrap results in `return`, others don't.
 */
function normalise<T>(raw: any): T {
  if (!raw) return { statusCode: 'ERR', statusMsg: 'Empty response' } as T;
  if (raw.return) {
    return { ...raw.return } as T;
  }
  return raw as T;
}

async function call<T>(method: string, args: Record<string, any>): Promise<T> {
  const client = await getClient();
  const fn = (client as any)[`${method}Async`];
  if (!fn) {
    throw new Error(`SOAP method ${method} not found on client`);
  }
  try {
    const [result] = await fn.call(client, args);
    return normalise<T>(result);
  } catch (err: any) {
    console.error(`[MTSAClient] ${method} failed:`, err.message);
    throw err;
  }
}

// ---- Public API ----

export async function getCertInfo(
  req: GetCertInfoRequest
): Promise<GetCertInfoResponse> {
  return call('GetCertInfo', req);
}

export async function requestCertificate(
  req: RequestCertificateRequest
): Promise<RequestCertificateResponse> {
  return call('RequestCertificate', req);
}

export async function requestEmailOTP(
  req: RequestEmailOTPRequest
): Promise<RequestEmailOTPResponse> {
  return call('RequestEmailOTP', req);
}

export async function verifyCertPin(
  req: VerifyCertPinRequest
): Promise<VerifyCertPinResponse> {
  return call('VerifyCertPin', req);
}

export async function signPDF(
  req: SignPDFRequest
): Promise<SignPDFResponse> {
  return call('SignPDF', req);
}

export async function verifyPDFSignature(
  req: VerifyPDFSignatureRequest
): Promise<VerifyPDFSignatureResponse> {
  // Bypass node-soap's XML builder which corrupts large base64 payloads.
  // Build the SOAP envelope manually and parse the XML response.
  const endpoint = `${config.mtsa.url}${config.mtsa.wsdlPath.replace('?wsdl', '')}`;
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:mtsa="http://mtsa.msctg.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <mtsa:VerifyPDFSignature>
      <SignedPdfInBase64>${req.SignedPdfInBase64}</SignedPdfInBase64>
    </mtsa:VerifyPDFSignature>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      Username: SOAP_HEADERS.Username,
      Password: SOAP_HEADERS.Password,
    },
    body: envelope,
  });

  const xml = await res.text();
  return parseVerifyResponse(xml);
}

function parseVerifyResponse(xml: string): VerifyPDFSignatureResponse {
  const tag = (name: string, src: string): string | undefined => {
    const m = src.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    return m?.[1];
  };

  const returnBlock = tag('return', xml);
  if (!returnBlock) {
    return { statusCode: 'ERR', statusMsg: 'Failed to parse SOAP response' } as VerifyPDFSignatureResponse;
  }

  const statusCode = tag('statusCode', returnBlock) ?? 'ERR';
  const statusMsg = tag('statusMsg', returnBlock) ?? '';
  const totalStr = tag('totalSignatureInPdf', returnBlock);
  const totalSignatureInPdf = totalStr ? parseInt(totalStr, 10) : 0;

  const pdfSignatureList: VerifyPDFSignatureResponse['pdfSignatureList'] = [];
  const sigRegex = /<pdfSignatureList>([\s\S]*?)<\/pdfSignatureList>/g;
  let match: RegExpExecArray | null;
  while ((match = sigRegex.exec(returnBlock)) !== null) {
    const s = match[1];
    pdfSignatureList.push({
      sigCoverWholeDocument: tag('sigCoverWholeDocument', s) === 'true',
      sigName: tag('sigName', s),
      sigRevisionNo: tag('sigRevisionNo', s),
      sigSignerCert: tag('sigSignerCert', s),
      sigSignerCertIssuer: tag('sigSignerCertIssuer', s),
      sigSignerCertStatus: tag('sigSignerCertStatus', s),
      sigSignerCertSubject: tag('sigSignerCertSubject', s),
      sigStatusValid: tag('sigStatusValid', s) === 'true',
      sigTimeStamp: tag('sigTimeStamp', s),
    });
  }

  return { statusCode, statusMsg, totalSignatureInPdf, pdfSignatureList } as VerifyPDFSignatureResponse;
}

export async function requestRevokeCert(
  req: RequestRevokeCertRequest
): Promise<RequestRevokeCertResponse> {
  return call('RequestRevokeCert', req);
}

export async function resetCertificatePin(
  req: ResetCertificatePinRequest
): Promise<ResetCertificatePinResponse> {
  return call('ResetCertificatePin', req);
}

export async function updateEmailAddress(
  req: UpdateEmailAddressRequest
): Promise<UpdateEmailAddressResponse> {
  return call('UpdateEmailAddress', req);
}

export async function requestSMSOTP(
  req: RequestSMSOTPRequest
): Promise<RequestSMSOTPResponse> {
  return call('RequestSMSOTP', req);
}

export async function updateMobileNo(
  req: UpdateMobileNoRequest
): Promise<UpdateMobileNoResponse> {
  return call('UpdateMobileNo', req);
}

export async function healthCheck(): Promise<boolean> {
  try {
    await getClient();
    return true;
  } catch {
    return false;
  }
}
