import type { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet, importSPKI, type KeyLike, type JWTVerifyGetKey } from 'jose';
import { config } from '../config';
import { signerService } from '../modules/execution/signer.service';

export interface AuthenticatedRequest extends Request {
  user: {
    privyId: string;
  };
}

let cachedKey: KeyLike | JWTVerifyGetKey | null = null;

async function initKey(): Promise<KeyLike | JWTVerifyGetKey> {
  let staticKey = process.env.PRIVY_VERIFICATION_KEY;

  if (staticKey) {
    staticKey = staticKey.replace(/\\n/g, '\n');
    if (!staticKey.includes('-----BEGIN')) {
      staticKey = `-----BEGIN PUBLIC KEY-----\n${staticKey}\n-----END PUBLIC KEY-----`;
    }
    console.log('[AUTH] Using static PRIVY_VERIFICATION_KEY');
    return importSPKI(staticKey, 'ES256');
  }

  console.log('[AUTH] No static key — falling back to JWKS (requires network)');
  return createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${config.privyAppId}/.well-known/jwks.json`),
  );
}

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

  try {
    if (!cachedKey) cachedKey = await initKey();

    const { payload } = await jwtVerify(token, cachedKey as any, {
      issuer: 'privy.io',
      audience: config.privyAppId,
    });

    const userId = payload.sub;
    if (!userId) throw new Error('No sub claim in token');

    (req as AuthenticatedRequest).user = { privyId: userId };
    // Store user JWT for server wallet signing
    signerService.setUserToken(userId, token);
    next();
  } catch (err) {
    cachedKey = null;
    console.error('[AUTH] JWT verification failed:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
