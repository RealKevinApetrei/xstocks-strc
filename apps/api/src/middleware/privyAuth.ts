import type { Request, Response, NextFunction } from 'express';
import { verifyAuthToken } from '@privy-io/node';
import { createRemoteJWKSet } from 'jose';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  user: {
    privyId: string;
  };
}

const jwks = createRemoteJWKSet(
  new URL(`https://auth.privy.io/api/v1/apps/${config.privyAppId}/.well-known/jwks.json`),
);

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
    // Try verifyAuthToken first (matches Privy React SDK's getAccessToken)
    const result = await verifyAuthToken({
      auth_token: token,
      app_id: config.privyAppId,
      verification_key: jwks,
    });
    (req as AuthenticatedRequest).user = { privyId: result.user_id };
    next();
  } catch (err) {
    console.error('[AUTH] Token verification failed:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
