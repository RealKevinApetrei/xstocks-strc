import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '@privy-io/node';
import { createRemoteJWKSet } from 'jose';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  user: {
    privyId: string;
  };
}

// JWKS endpoint for Privy token verification
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
    const result = await verifyAccessToken({
      access_token: token,
      app_id: config.privyAppId,
      verification_key: jwks,
    });
    (req as AuthenticatedRequest).user = { privyId: result.user_id };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
