import express from 'express';
import cors from 'cors';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { executionRouter } from './modules/execution/execution.router';
import { gridRouter } from './modules/grid/grid.router';
import { savingsRouter } from './modules/savings/savings.router';
import { morphoRouter } from './modules/morpho/morpho.router';

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
app.use('/api/savings', savingsRouter);
app.use('/api/morpho', morphoRouter);

// Positions route is on execution router
app.use('/api', executionRouter);

// Error handler
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`xStocks API running on port ${config.port}`);
  console.log(`Chain: Ink (${config.chainId})`);
});
