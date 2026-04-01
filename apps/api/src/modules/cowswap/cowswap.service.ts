import { config } from '../../config';
import { COW_POLL_INTERVAL_MS } from '@xstocks/shared';

export interface CowQuote {
  order: Record<string, unknown>;
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  expectedBuyAmount: bigint;
}

export type OrderStatus = 'open' | 'fulfilled' | 'cancelled' | 'expired';

const COW_ORDER_TYPES = {
  Order: [
    { name: 'sellToken', type: 'address' },
    { name: 'buyToken', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'sellAmount', type: 'uint256' },
    { name: 'buyAmount', type: 'uint256' },
    { name: 'validTo', type: 'uint32' },
    { name: 'appData', type: 'bytes32' },
    { name: 'feeAmount', type: 'uint256' },
    { name: 'kind', type: 'string' },
    { name: 'partiallyFillable', type: 'bool' },
    { name: 'sellTokenBalance', type: 'string' },
    { name: 'buyTokenBalance', type: 'string' },
  ],
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class CowSwapService {
  private get baseUrl() {
    if (!config.cowApiUrl) throw new Error('COW_API_URL not configured');
    return config.cowApiUrl;
  }

  private getDomain() {
    return {
      name: 'Gnosis Protocol',
      version: 'v2',
      chainId: config.chainId,
      verifyingContract: config.cowSettlement,
    };
  }

  /**
   * Fetch with retry on network errors.
   */
  private async fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, options);
        // Retry on 429 (rate limit) and 5xx (server errors)
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
          console.warn(`[CoW] HTTP ${response.status} on attempt ${attempt}, retrying...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
          continue;
        }
        return response;
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err;
        console.warn(`[CoW] Network error on attempt ${attempt}, retrying...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
    throw new Error('Unreachable');
  }

  async getQuote(params: {
    sellToken: string;
    buyToken: string;
    sellAmount: bigint;
    from: string;
  }): Promise<CowQuote> {
    if (params.sellAmount <= 0n) throw new Error('CoW quote: sellAmount must be > 0');

    const validTo = Math.floor(Date.now() / 1000) + 600; // 10 min

    const quoteUrl = `${this.baseUrl}/api/v1/quote`;
    console.log(`[COW] Quote URL: ${quoteUrl}`);
    const response = await this.fetchWithRetry(quoteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        sellAmountBeforeFee: params.sellAmount.toString(),
        from: params.from,
        kind: 'sell',
        receiver: params.from,
        validTo,
        appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CoW quote failed (${response.status}): ${error.slice(0, 200)}`);
    }

    const data = (await response.json()) as { quote?: Record<string, any> };
    if (!data.quote?.buyAmount) throw new Error('CoW quote response missing buyAmount');

    const buyAmount = BigInt(data.quote.buyAmount as string);
    if (buyAmount <= 0n) throw new Error('CoW quote returned 0 buyAmount');

    return {
      order: data.quote,
      domain: this.getDomain(),
      types: COW_ORDER_TYPES,
      primaryType: 'Order',
      expectedBuyAmount: buyAmount,
    };
  }

  async createOrder(quote: CowQuote, signature: string): Promise<string> {
    if (!signature) throw new Error('CoW createOrder: missing signature');

    // Check quote hasn't expired
    const validTo = (quote.order as any).validTo;
    if (validTo && Math.floor(Date.now() / 1000) >= validTo) {
      throw new Error('CoW order: quote has expired (validTo passed)');
    }

    // Log order details for debugging
    console.log(`[COW] Creating order: from=${(quote.order as any).sellToken}, owner=${(quote.order as any).receiver || (quote.order as any).from}`);

    const response = await this.fetchWithRetry(`${this.baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...quote.order,
        feeAmount: '0',
        signature,
        from: (quote.order as any).receiver || (quote.order as any).from,
        signingScheme: 'eip1271',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CoW order creation failed (${response.status}): ${error.slice(0, 200)}`);
    }

    const orderUid = await response.json();
    if (!orderUid || typeof orderUid !== 'string') {
      throw new Error(`CoW order returned invalid UID: ${JSON.stringify(orderUid)}`);
    }

    return orderUid;
  }

  async pollOrderStatus(orderUid: string): Promise<OrderStatus> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/api/v1/orders/${orderUid}`);
    if (!response.ok) throw new Error(`CoW status check failed (${response.status}): ${orderUid}`);

    const data = (await response.json()) as { status: string };

    if (data.status === 'fulfilled') return 'fulfilled';
    if (data.status === 'cancelled') return 'cancelled';
    if (data.status === 'expired') return 'expired';
    return 'open';
  }

  async waitForFill(orderUid: string): Promise<{ buyAmount: bigint }> {
    const deadline = Date.now() + config.cowTimeoutMs;

    while (Date.now() < deadline) {
      try {
        const status = await this.pollOrderStatus(orderUid);

        if (status === 'fulfilled') {
          const response = await this.fetchWithRetry(`${this.baseUrl}/api/v1/trades?orderUid=${orderUid}`);
          const trades = (await response.json()) as Array<{ buyAmount: string }>;

          if (!trades || trades.length === 0) {
            throw new Error(`CoW order fulfilled but no trades found: ${orderUid}`);
          }

          const totalBuyAmount = trades.reduce((sum: bigint, t) => sum + BigInt(t.buyAmount), 0n);
          return { buyAmount: totalBuyAmount };
        }

        if (status === 'cancelled' || status === 'expired') {
          throw new Error(`CoW order ${status}: ${orderUid}`);
        }
      } catch (err) {
        // Only rethrow if it's a definitive failure (cancelled/expired), not a network blip
        if (err instanceof Error && (err.message.includes('cancelled') || err.message.includes('expired'))) {
          throw err;
        }
        console.warn(`[CoW] Poll error (will retry): ${err instanceof Error ? err.message : err}`);
      }

      await new Promise((resolve) => setTimeout(resolve, COW_POLL_INTERVAL_MS));
    }

    throw new Error(`CoW order timed out after ${config.cowTimeoutMs / 1000}s: ${orderUid}`);
  }
}

export const cowSwapService = new CowSwapService();
