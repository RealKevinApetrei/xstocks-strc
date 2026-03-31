import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function chainlinkWebhookAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = req.headers['x-webhook-secret'];
  if (!config.pythWebhookSecret || secret !== config.pythWebhookSecret) {
    res.status(401).json({ error: 'Invalid webhook secret' });
    return;
  }

  // Reject stale webhooks (>5 min old)
  const { timestamp } = req.body ?? {};
  if (timestamp && Date.now() / 1000 - timestamp > 300) {
    res.status(400).json({ error: 'Stale webhook — timestamp too old' });
    return;
  }

  next();
}
