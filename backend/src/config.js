import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig() {
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT || 3000),
    publicBaseUrl,
    frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:8080',
    frontendRedirectUrl: process.env.FRONTEND_REDIRECT_URL || process.env.FRONTEND_ORIGIN || 'http://localhost:8080',
    databaseUrl: requireEnv('DATABASE_URL'),
    sessionSecret: requireEnv('SESSION_SECRET'),
    microsoft: {
      tenantId,
      clientId: requireEnv('MICROSOFT_CLIENT_ID'),
      clientSecret: requireEnv('MICROSOFT_CLIENT_SECRET'),
      authorizeUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`
    }
  };
}
