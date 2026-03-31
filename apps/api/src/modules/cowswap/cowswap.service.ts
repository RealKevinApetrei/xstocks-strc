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

// CoW Protocol EIP-712 Order types
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

export class CowSwapService {
  private baseUrl = config.cowApiUrl;

  private getDomain() {
    return {
      name: 'Gnosis Protocol',
      version: 'v2',
      chainId: config.chainId,
      verifyingContract: config.cowSettlement,
    };
  }

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
        validTo: Math.floor(Date.now() / 1000) + 600,
        appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CoW quote failed: ${error}`);
    }

    const data = (await response.json()) as { quote: Record<string, any> };

    return {
      order: data.quote,
      domain: this.getDomain(),
      types: COW_ORDER_TYPES,
      primaryType: 'Order',
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

    return (await response.json()) as string;
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
    const deadline = Date.now() + config.cowTimeoutMs;

    while (Date.now() < deadline) {
      const status = await this.pollOrderStatus(orderUid);

      if (status === 'fulfilled') {
        const response = await fetch(`${this.baseUrl}/api/v1/trades?orderUid=${orderUid}`);
        const trades = (await response.json()) as Array<{ buyAmount: string }>;
        const totalBuyAmount = trades.reduce(
          (sum: bigint, t) => sum + BigInt(t.buyAmount),
          0n,
        );
        return { buyAmount: totalBuyAmount };
      }

      if (status === 'cancelled' || status === 'expired') {
        throw new Error(`CoW order ${status}: ${orderUid}`);
      }

      await new Promise((resolve) => setTimeout(resolve, COW_POLL_INTERVAL_MS));
    }

    throw new Error(`CoW order timed out after ${config.cowTimeoutMs / 1000}s: ${orderUid}`);
  }
}

export const cowSwapService = new CowSwapService();
