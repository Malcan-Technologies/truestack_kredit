export const config = {
  port: parseInt(process.env.PORT || '3100', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  signingApiKey: process.env.SIGNING_API_KEY || 'dev-signing-key',

  mtsa: {
    url: process.env.MTSA_URL || 'http://localhost:8080',
    wsdlPath:
      process.env.MTSA_WSDL_PATH ||
      '/MTSAPilot/MyTrustSignerAgentWSAPv2?wsdl',
    soapUsername: process.env.MTSA_SOAP_USERNAME || '',
    soapPassword: process.env.MTSA_SOAP_PASSWORD || '',
  },

  storage: {
    path: process.env.STORAGE_PATH || '/data/documents',
  },

  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
  },
} as const;

export function validateConfig(): void {
  const missing: string[] = [];

  if (!config.mtsa.soapUsername) missing.push('MTSA_SOAP_USERNAME');
  if (!config.mtsa.soapPassword) missing.push('MTSA_SOAP_PASSWORD');

  if (missing.length > 0) {
    console.error(
      `[Config] Missing required environment variables: ${missing.join(', ')}`
    );
    process.exit(1);
  }
}

export function getMtsaWsdlUrl(): string {
  return `${config.mtsa.url}${config.mtsa.wsdlPath}`;
}
