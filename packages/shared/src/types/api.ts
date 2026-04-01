// ============================================
// Execution Types
// ============================================

export type ExecutionStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'COMPLETED_PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type ExecutionType =
  | 'LOOP'
  | 'UNWIND'
  | 'APPROVAL'
  | 'SUPPLY'
  | 'BORROW'
  | 'REPAY'
  | 'WITHDRAW'
  | 'SWAP'
  | 'GRID_BUY'
  | 'VAULT_DEPOSIT'
  | 'VAULT_WITHDRAW';

export type IterationStep =
  | 'PENDING'
  | 'APPROVING'
  | 'WRAPPING'
  | 'SUPPLYING'
  | 'BORROWING'
  | 'SWAPPING'
  | 'COMPLETED'
  | 'FAILED';

// ============================================
// Request Types
// ============================================

export interface StartLoopRequest {
  strcAmount: string;
  targetLeverage: number;
  maxSlippageBps: number;
}

export interface StartUnwindRequest {
  loopExecutionId: string;
}

export interface CreateGridStrategyRequest {
  triggerPrice?: number;
  numTrades?: number;
  tradeIntervalHours?: number;
}

export interface UpdateGridStrategyRequest {
  triggerPrice?: number;
  numTrades?: number;
  tradeIntervalHours?: number;
  enabled?: boolean;
}

export interface VaultDepositRequest {
  amount: string;
}

export interface VaultWithdrawRequest {
  amount: string;
}

// ============================================
// Response Types
// ============================================

export interface StartLoopResponse {
  id: string;
  status: 'PENDING';
  strcAmount: string;
  targetLeverage: number;
  createdAt: string;
}

export interface StartUnwindResponse {
  id: string;
  loopExecutionId: string;
  status: 'PENDING';
  createdAt: string;
}

export interface LoopIteration {
  number: number;
  status: IterationStep;
  strcDeposited: string | null;
  usdcBorrowed: string | null;
  strcReceived: string | null;
  slippageBps: number | null;
  userOpHash: string | null;
  cowOrderUid: string | null;
  completedAt: string | null;
}

export interface LoopStatusResponse {
  id: string;
  status: ExecutionStatus;
  strcAmount: string;
  targetLeverage: number;
  effectiveLeverage: number | null;
  currentIteration: number;
  totalIterations: number | null;
  healthFactor: number | null;
  iterations: LoopIteration[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UnwindStatusResponse {
  id: string;
  status: ExecutionStatus;
  targetLeverage: number;
  currentStep: number;
  initialDebtUsdc: string;
  remainingDebtUsdc: string;
  initialCollateralWstrc: string;
  remainingCollateralWstrc: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MorphoPosition {
  collateralWstrc: string;
  collateralStrc: string;
  debtUsdc: string;
  healthFactor: number;
  effectiveLeverage: number;
  liquidationPrice: number;
  exchangeRate: string;
}

export interface PositionResponse {
  address: string;
  hasPosition: boolean;
  position: MorphoPosition | null;
  activeLoop: { id: string; status: string } | null;
  gridStrategy: { id: string; enabled: boolean; dcaActive?: boolean; tradesExecuted?: number; numTrades?: number } | null;
  vaultBalance: { shares: string; assets: string } | null;
  strcBalance?: string;
}

export interface GridStrategy {
  id: string;
  triggerPrice: number;
  numTrades: number;
  tradeIntervalHours: number;
  dcaActive: boolean;
  tradesExecuted: number;
  usdcPerTrade: string | null;
  lastTradeAt: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface GridEvent {
  id: string;
  type: 'grid_buy';
  triggerPrice: number;
  amountUsdc: string;
  amountStrc: string | null;
  status: ExecutionStatus;
  cowOrderUid: string | null;
  error: string | null;
  createdAt: string;
}

export interface GridEventsResponse {
  events: GridEvent[];
}

export interface GridTriggerRequest {
  price: number;
  timestamp: number;
}

export interface VaultBalanceResponse {
  shares: string;
  assets: string;
  yieldEarned: string;
}

export interface VaultTxResponse {
  txHash: string;
  shares?: string;
  assets?: string;
}

export interface SimulatedApyResponse {
  currentApy: number;
  leveragedApy: {
    '1x': number;
    '2x': number;
    '3x': number;
    '3.5x': number;
  };
  history: Array<{
    timestamp: string;
    baseApy: number;
    leveraged3xApy: number;
  }>;
}

// ============================================
// Error Response
// ============================================

export interface ApiError {
  error: string;
  details?: string;
}
