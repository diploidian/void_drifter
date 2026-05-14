import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

function redirectUri(config) {
  return new URL('/auth/microsoft/callback', config.publicBaseUrl).toString();
}

export function microsoftLoginUrl(config, req) {
  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');
  req.session.oauth = { state, nonce };

  const url = new URL(config.microsoft.authorizeUrl);
  url.searchParams.set('client_id', config.microsoft.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri(config));
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', 'openid profile email offline_access');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  return url.toString();
}

export async function exchangeMicrosoftCode(config, req, code, state) {
  if (!req.session.oauth || req.session.oauth.state !== state) {
    const err = new Error('Invalid OAuth state');
    err.status = 400;
    throw err;
  }

  const tokenResponse = await fetch(config.microsoft.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.microsoft.clientId,
      client_secret: config.microsoft.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(config),
      scope: 'openid profile email offline_access'
    })
  });

  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok) {
    const err = new Error(tokenBody.error_description || 'Microsoft token exchange failed');
    err.status = 502;
    throw err;
  }

  const jwks = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${config.microsoft.tenantId}/discovery/v2.0/keys`)
  );
  const { payload } = await jwtVerify(tokenBody.id_token, jwks, {
    audience: config.microsoft.clientId,
    nonce: req.session.oauth.nonce
  });

  delete req.session.oauth;
  return payload;
}
