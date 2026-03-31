import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, verifyAuthToken } from '@privy-io/node';
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

  // Try both token types — Privy SDK can send either access or auth tokens
  // depending on the version and configuration
  try {
    const result = await verifyAccessToken({
      access_token: token,
      app_id: config.privyAppId,
      verification_key: jwks,
    });
    (req as AuthenticatedRequest).user = { privyId: result.user_id };
    next();
    return;
  } catch (e1) {
    // Access token failed, try auth token
    try {
      const result = await verifyAuthToken({
        auth_token: token,
        app_id: config.privyAppId,
        verification_key: jwks,
      });
      (req as AuthenticatedRequest).user = { privyId: result.user_id };
      next();
      return;
    } catch (e2) {
      console.error('[AUTH] Both verifications failed:');
      console.error('[AUTH] Access token error:', e1 instanceof Error ? e1.message : e1);
      console.error('[AUTH] Auth token error:', e2 instanceof Error ? e2.message : e2);
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
}
