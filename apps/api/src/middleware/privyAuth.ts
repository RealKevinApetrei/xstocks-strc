import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, verifyAuthToken } from '@privy-io/node';
import { createRemoteJWKSet } from 'jose';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  user: {
    privyId: string;
  };
}

const JWKS_URL = `https://auth.privy.io/api/v1/apps/${config.privyAppId}/.well-known/jwks.json`;
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

// Log JWKS URL at startup for debugging
console.log(`[AUTH] JWKS URL: ${JWKS_URL}`);
console.log(`[AUTH] App ID: ${config.privyAppId}`);

export async function privyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  // Decode JWT payload without verification to inspect claims
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      console.log('[AUTH] Token claims:', JSON.stringify({
        iss: payload.iss,
        aud: payload.aud,
        sub: payload.sub,
        exp: payload.exp,
        iat: payload.iat,
        now: Math.floor(Date.now() / 1000),
        expired: payload.exp < Math.floor(Date.now() / 1000),
      }));
    }
  } catch { /* ignore decode errors */ }

  // Try access token verification
  try {
    const result = await verifyAccessToken({
      access_token: token,
      app_id: config.privyAppId,
      verification_key: jwks,
    });
    console.log('[AUTH] Access token verified, user:', result.user_id);
    (req as AuthenticatedRequest).user = { privyId: result.user_id };
    next();
    return;
  } catch (e1) {
    const msg1 = e1 instanceof Error ? `${e1.name}: ${e1.message}` : String(e1);
    console.error('[AUTH] Access token failed:', msg1);

    // Try auth token verification
    try {
      const result = await verifyAuthToken({
        auth_token: token,
        app_id: config.privyAppId,
        verification_key: jwks,
      });
      console.log('[AUTH] Auth token verified, user:', result.user_id);
      (req as AuthenticatedRequest).user = { privyId: result.user_id };
      next();
      return;
    } catch (e2) {
      const msg2 = e2 instanceof Error ? `${e2.name}: ${e2.message}` : String(e2);
      console.error('[AUTH] Auth token also failed:', msg2);
      if (e2 instanceof Error && e2.stack) {
        console.error('[AUTH] Stack:', e2.stack.split('\n').slice(0, 3).join('\n'));
      }
    }
  }

  res.status(401).json({ error: 'Invalid or expired token' });
}
