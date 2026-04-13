import { z } from "zod";

export const SigningHealthResultSchema = z.object({
  success: z.boolean(),
  online: z.boolean(),
  mtsaConnected: z.boolean().optional(),
  reason: z.string().optional(),
});

export const CertStatusResultSchema = z.object({
  success: z.boolean(),
  hasCert: z.boolean(),
  certStatus: z.string().nullable(),
  certValidFrom: z.string().nullable(),
  certValidTo: z.string().nullable(),
  certSerialNo: z.string().nullable(),
  statusCode: z.string(),
  statusMsg: z.string().optional(),
  errorDescription: z.string().optional(),
});

export const OtpResultSchema = z.object({
  success: z.boolean(),
  statusCode: z.string(),
  statusMsg: z.string().optional(),
  errorDescription: z.string().optional(),
  email: z.string().nullable().optional(),
});

export const EnrollResultSchema = z.object({
  success: z.boolean(),
  statusCode: z.string(),
  statusMsg: z.string().optional(),
  errorDescription: z.string().optional(),
  certSerialNo: z.string().nullable(),
  certValidFrom: z.string().nullable(),
  certValidTo: z.string().nullable(),
});

export const SignAgreementResultSchema = z.object({
  success: z.boolean(),
  statusCode: z.string().optional(),
  statusMsg: z.string().optional(),
  errorDescription: z.string().optional(),
  agreementDate: z.string().optional(),
  filename: z.string().optional(),
  sizeBytes: z.number().optional(),
  signedAgreementReviewStatus: z.string().optional(),
});

export const SigningAuthMethodSchema = z.enum(["emailOtp", "pin"]);

export const CheckEmailChangeResultSchema = z.object({
  success: z.boolean(),
  requiresOtp: z.boolean(),
  otpSent: z.boolean().optional(),
  error: z.string().optional(),
});

export const ConfirmEmailChangeResultSchema = z.object({
  success: z.boolean(),
  statusCode: z.string().optional(),
  statusMsg: z.string().optional(),
  errorDescription: z.string().optional(),
});
