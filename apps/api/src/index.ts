import express from 'express';
import cors from 'cors';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { executionRouter } from './modules/execution/execution.router';
import { gridRouter } from './modules/grid/grid.router';
import { pythPriceService } from './modules/pyth/pyth-price.service';

const app = express();

// Middleware
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', chain: config.chainId });
});

// Routes
app.use('/api/execution', executionRouter);
app.use('/api/grid', gridRouter);

// Positions route is on execution router
app.use('/api', executionRouter);

// Error handler
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`xStocks API running on port ${config.port}`);
  console.log(`Chain: Ink (${config.chainId})`);

  // Start Pyth price polling (reads from Hermes every 30s for grid triggers)
  // On-chain price updates are pushed on-demand before executions
  if (config.pythPriceFeedId) {
    pythPriceService.start();
  } else {
    console.log('Pyth feed ID not configured — price service disabled');
  }
});
