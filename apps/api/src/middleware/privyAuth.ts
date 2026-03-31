import type { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet, importSPKI } from 'jose';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  user: {
    privyId: string;
  };
}

// Use either a static verification key (from Privy Dashboard) or JWKS URL
// Static key avoids network requests — works even when JWKS endpoint is unreachable
async function getVerificationKey() {
  const staticKey = process.env.PRIVY_VERIFICATION_KEY;
  if (staticKey) {
    // Static SPKI public key from Privy Dashboard
    return importSPKI(staticKey, 'ES256');
  }
  // Fallback to JWKS (requires network access to auth.privy.io)
  return createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${config.privyAppId}/.well-known/jwks.json`),
  );
}

let verificationKey: Awaited<ReturnType<typeof getVerificationKey>> | null = null;

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
    if (!verificationKey) {
      verificationKey = await getVerificationKey();
    }

    const { payload } = await jwtVerify(token, verificationKey, {
      issuer: 'privy.io',
      audience: config.privyAppId,
    });

    const userId = payload.sub;
    if (!userId) throw new Error('No sub claim in token');

    (req as AuthenticatedRequest).user = { privyId: userId };
    next();
  } catch (err) {
    // Reset key on failure in case it was cached incorrectly
    verificationKey = null;
    console.error('[AUTH] JWT verification failed:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
