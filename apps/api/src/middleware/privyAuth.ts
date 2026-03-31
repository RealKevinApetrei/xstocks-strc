import type { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';
import { config } from '../config';

const privy = new PrivyClient(config.privyAppId, config.privyAppSecret);

export interface AuthenticatedRequest extends Request {
  user: {
    privyId: string;
  };
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
    const claims = await privy.verifyAuthToken(token);
    (req as AuthenticatedRequest).user = { privyId: claims.userId };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
