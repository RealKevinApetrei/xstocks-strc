import type { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  user: {
    privyId: string;
  };
}

const JWKS_URL = `https://auth.privy.io/api/v1/apps/${config.privyAppId}/.well-known/jwks.json`;
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

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
    // Verify JWT directly with jose — bypasses Privy SDK's mapAndThrowJoseErrors wrapper
    const { payload } = await jwtVerify(token, jwks, {
      issuer: 'privy.io',
      audience: config.privyAppId,
    });

    const userId = payload.sub;
    if (!userId) throw new Error('No sub claim in token');

    (req as AuthenticatedRequest).user = { privyId: userId };
    next();
  } catch (err) {
    console.error('[AUTH] JWT verification failed:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
