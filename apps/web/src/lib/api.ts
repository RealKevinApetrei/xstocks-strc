import type {
  StartLoopRequest, StartLoopResponse,
  StartUnwindRequest, StartUnwindResponse,
  LoopStatusResponse,
  PositionResponse,
  GridStrategy, CreateGridStrategyRequest, UpdateGridStrategyRequest,
  GridEventsResponse,
  VaultBalanceResponse, VaultTxResponse,
  SimulatedApyResponse,
} from '@xstocks/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, error.error ?? 'Request failed');
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================
// API Client
// ============================================

export const api = {
  // Loop
  startLoop: (token: string, body: StartLoopRequest) =>
    request<StartLoopResponse>('/api/execution/loop', { method: 'POST', body: JSON.stringify(body), token }),

  getLoopStatus: (token: string, id: string) =>
    request<LoopStatusResponse>(`/api/execution/loop/${id}/status`, { token }),

  // Unwind
  startUnwind: (token: string, body: StartUnwindRequest) =>
    request<StartUnwindResponse>('/api/execution/unwind', { method: 'POST', body: JSON.stringify(body), token }),

  // Position
  getPosition: (token: string, address: string) =>
    request<PositionResponse>(`/api/positions/${address}`, { token }),

  // Grid
  createGridStrategy: (token: string, body: CreateGridStrategyRequest) =>
    request<GridStrategy>('/api/grid/strategy', { method: 'POST', body: JSON.stringify(body), token }),

  getGridStrategy: (token: string, id: string) =>
    request<GridStrategy>(`/api/grid/strategy/${id}`, { token }),

  updateGridStrategy: (token: string, id: string, body: UpdateGridStrategyRequest) =>
    request<GridStrategy>(`/api/grid/strategy/${id}`, { method: 'PUT', body: JSON.stringify(body), token }),

  getGridEvents: (token: string, strategyId: string) =>
    request<GridEventsResponse>(`/api/grid/events/${strategyId}`, { token }),

  // Vault
  depositToVault: (token: string, amount: string) =>
    request<VaultTxResponse>('/api/grid/vault/deposit', { method: 'POST', body: JSON.stringify({ amount }), token }),

  withdrawFromVault: (token: string, amount: string) =>
    request<VaultTxResponse>('/api/grid/vault/withdraw', { method: 'POST', body: JSON.stringify({ amount }), token }),

  getVaultBalance: (token: string, address: string) =>
    request<VaultBalanceResponse>(`/api/grid/vault/balance/${address}`, { token }),

  // APY
  getSimulatedApy: () =>
    request<SimulatedApyResponse>('/api/apy/simulated'),

  // Price (Pyth Hermes — STRCx/USD)
  getStrcxPrice: () =>
    request<{ price: number; timestamp: number; stale: boolean; source: string }>('/api/grid/price'),

  // Aave USDC yield (real data from DeFi Llama)
  getAaveYield: (days: number = 90) =>
    request<{ currentSupplyApy: number; history: Array<{ timestamp: string; supplyApy: number }> }>(`/api/apy/aave?days=${days}`),

  // Historical STRC prices (Pyth Benchmarks)
  getStrcPriceHistory: (days: number = 90) =>
    request<{ history: Array<{ price: number; timestamp: number }>; count: number; source: string }>(`/api/grid/price/history?days=${days}`),

  // Loop history (paginated)
  getLoopHistory: (token: string, limit: number = 20, offset: number = 0) =>
    request<{
      loops: Array<{
        id: string; strcAmount: string; targetLeverage: number; effectiveLeverage: number | null;
        healthFactor: number | null; iterations: number; status: string; error: string | null;
        createdAt: string; updatedAt: string;
      }>;
      total: number; limit: number; offset: number;
    }>(`/api/execution/loops?limit=${limit}&offset=${offset}`, { token }),
};
