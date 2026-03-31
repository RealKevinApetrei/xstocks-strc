import express from 'express';
import cors from 'cors';
import { config, validateConfig, isExecutionEnabled } from './config';
import { errorHandler } from './middleware/errorHandler';
import { executionRouter } from './modules/execution/execution.router';
import { gridRouter } from './modules/grid/grid.router';
import { pythPriceService } from './modules/pyth/pyth-price.service';
import { loopExecutor } from './modules/execution/executors/loop.executor';
import { unwindExecutor } from './modules/execution/executors/unwind.executor';

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

// Validate config before starting
validateConfig();

app.listen(config.port, () => {
  console.log(`xStocks API running on port ${config.port}`);
  console.log(`Chain: Ink (${config.chainId})`);
  console.log(`Execution: ${isExecutionEnabled() ? 'ENABLED' : 'DISABLED (missing contract addresses)'}`);

  // Resume any interrupted executions from DB
  loopExecutor.resumeActiveLoops().catch(console.error);
  unwindExecutor.resumeActiveUnwinds().catch(console.error);

  // Start Pyth price polling for grid triggers (reads from Hermes, no gas)
  if (config.pythPriceFeedId) {
    pythPriceService.start();
  } else {
    console.log('Pyth feed ID not configured — price service disabled');
  }
});
