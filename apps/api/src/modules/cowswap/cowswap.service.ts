import { config } from '../../config';
import { COW_POLL_INTERVAL_MS, COW_TIMEOUT_MS } from '@xstocks/shared';

export interface CowQuote {
  order: Record<string, unknown>;
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  expectedBuyAmount: bigint;
}

export type OrderStatus = 'open' | 'fulfilled' | 'cancelled' | 'expired';

export class CowSwapService {
  private baseUrl = config.cowApiUrl;

  /**
   * Get a swap quote from CoW Protocol.
   */
  async getQuote(params: {
    sellToken: string;
    buyToken: string;
    sellAmount: bigint;
    from: string;
  }): Promise<CowQuote> {
    const response = await fetch(`${this.baseUrl}/api/v1/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        sellAmountBeforeFee: params.sellAmount.toString(),
        from: params.from,
        kind: 'sell',
        receiver: params.from,
        validTo: Math.floor(Date.now() / 1000) + 600, // 10 min
        appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CoW quote failed: ${error}`);
    }

    const data = (await response.json()) as { quote: Record<string, any> };

    // TODO: Extract EIP-712 signing data from the quote response
    return {
      order: data.quote,
      domain: {}, // TODO: CoW settlement domain
      types: {},  // TODO: CoW order types
      expectedBuyAmount: BigInt(data.quote.buyAmount as string),
    };
  }

  /**
   * Submit a signed order to CoW Protocol.
   */
  async createOrder(quote: CowQuote, signature: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...quote.order,
        signature,
        signingScheme: 'eip712',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CoW order creation failed: ${error}`);
    }

    const orderUid = await response.json();
    return orderUid as string;
  }

  /**
   * Poll order status from CoW API.
   */
  async pollOrderStatus(orderUid: string): Promise<OrderStatus> {
    const response = await fetch(`${this.baseUrl}/api/v1/orders/${orderUid}`);
    if (!response.ok) throw new Error(`Failed to get order status: ${orderUid}`);

    const data = (await response.json()) as { status: string };

    if (data.status === 'fulfilled') return 'fulfilled';
    if (data.status === 'cancelled') return 'cancelled';
    if (data.status === 'expired') return 'expired';
    return 'open';
  }

  /**
   * Wait for a CoW order to be filled.
   * Polls every 30s, times out after 10 minutes.
   */
  async waitForFill(orderUid: string): Promise<{ buyAmount: bigint }> {
    const deadline = Date.now() + COW_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const status = await this.pollOrderStatus(orderUid);

      if (status === 'fulfilled') {
        // Get final fill amount
        const response = await fetch(`${this.baseUrl}/api/v1/trades?orderUid=${orderUid}`);
        const trades = await response.json();
        const totalBuyAmount = (trades as any[]).reduce(
          (sum: bigint, t: any) => sum + BigInt(t.buyAmount),
          0n,
        );
        return { buyAmount: totalBuyAmount };
      }

      if (status === 'cancelled' || status === 'expired') {
        throw new Error(`CoW order ${status}: ${orderUid}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, COW_POLL_INTERVAL_MS));
    }

    throw new Error(`CoW order timed out after ${COW_TIMEOUT_MS / 1000}s: ${orderUid}`);
  }
}

export const cowSwapService = new CowSwapService();
