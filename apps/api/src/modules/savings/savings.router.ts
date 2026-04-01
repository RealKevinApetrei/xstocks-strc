import { Router, type Request, type Response } from 'express';
import { privyAuth, type AuthenticatedRequest } from '../../middleware/privyAuth';
import { savingsService } from './savings.service';
import { bitrefillService } from './bitrefill.service';

export const savingsRouter = Router();

// POST /api/savings/deposit
savingsRouter.post('/deposit', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { usdcAmount } = req.body as { usdcAmount: number };

  if (!usdcAmount || usdcAmount < 20) {
    res.status(400).json({ error: 'Minimum deposit is $20 ($10 per asset)' });
    return;
  }

  try {
    const result = await savingsService.deposit({ privyId, usdcAmount });
    res.status(201).json({
      depositId: result.depositId,
      queued: result.queued,
      message: result.queued
        ? 'Markets are closed. Your deposit will be allocated Monday morning when markets open.'
        : 'Deposit received. Swapping to STRC and Invesco T-Bill via CoW Protocol.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Deposit failed';
    res.status(400).json({ error: msg });
  }
});

// POST /api/savings/withdraw
savingsRouter.post('/withdraw', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  try {
    const result = await savingsService.withdraw({ privyId });
    res.status(202).json({
      withdrawalId: result.withdrawalId,
      message: 'Withdrawal initiated. Selling STRC and T-Bill back to USDC via CoW Protocol.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Withdrawal failed';
    res.status(400).json({ error: msg });
  }
});

// GET /api/savings/portfolio
savingsRouter.get('/portfolio', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  try {
    const portfolio = await savingsService.getPortfolio(privyId);
    res.json(portfolio);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load portfolio';
    res.status(500).json({ error: msg });
  }
});

// GET /api/savings/catalog
savingsRouter.get('/catalog', privyAuth, async (_req: Request, res: Response) => {
  const catalog = await bitrefillService.getCatalog();
  res.json({ products: catalog });
});

// POST /api/savings/redeem
savingsRouter.post('/redeem', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { productId, valueUsd } = req.body as { productId: string; valueUsd: number };

  if (!productId || !valueUsd) {
    res.status(400).json({ error: 'productId and valueUsd are required' });
    return;
  }

  try {
    const result = await savingsService.redeem({ privyId, productId, valueUsd });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Redemption failed';
    res.status(400).json({ error: msg });
  }
});
