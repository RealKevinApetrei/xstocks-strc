import { config } from '../../config';

export interface BitrefillProduct {
  id: string;
  name: string;
  category: string;
  minValue: number;
  maxValue: number;
  currency: string;
  logoUrl: string;
}

export interface BitrefillOrder {
  orderId: string;
  productId: string;
  value: number;
  redemptionCode: string;
}

// Mocked catalog — replace with real Bitrefill API once approved
const MOCK_CATALOG: BitrefillProduct[] = [
  { id: 'netflix-us',   name: 'Netflix',     category: 'Entertainment', minValue: 15, maxValue: 100, currency: 'USD', logoUrl: '/logos/Netflix.png' },
  { id: 'amazon-us',   name: 'Amazon',      category: 'Shopping',      minValue: 5,  maxValue: 500, currency: 'USD', logoUrl: '/logos/Amazon.png' },
  { id: 'apple-us',    name: 'Apple',       category: 'Tech',          minValue: 10, maxValue: 500, currency: 'USD', logoUrl: '/logos/Apple.png' },
  { id: 'google-us',   name: 'Google Play', category: 'Entertainment', minValue: 10, maxValue: 200, currency: 'USD', logoUrl: '/logos/Google.png' },
  { id: 'microsoft-us',name: 'Microsoft',   category: 'Tech',          minValue: 10, maxValue: 100, currency: 'USD', logoUrl: '/logos/Microsoft.png' },
];

export class BitrefillService {
  private readonly isLive = Boolean(config.bitrefillApiKey);

  async getCatalog(): Promise<BitrefillProduct[]> {
    if (this.isLive) {
      // TODO: GET https://api.bitrefill.com/v2/products?country=US
      // Authorization: Basic base64(apiKey:)
    }
    return MOCK_CATALOG;
  }

  async placeOrder(productId: string, valueUsd: number): Promise<BitrefillOrder> {
    if (this.isLive) {
      // TODO: POST https://api.bitrefill.com/v2/orders
      // body: { productId, value: valueUsd, currency: 'USD', paymentMethod: 'balance' }
    }

    // Mock response
    const product = MOCK_CATALOG.find(p => p.id === productId);
    if (!product) throw new Error(`Unknown product: ${productId}`);
    if (valueUsd < product.minValue) throw new Error(`Minimum value for ${product.name} is $${product.minValue}`);

    return {
      orderId: `mock-${Date.now()}`,
      productId,
      value: valueUsd,
      redemptionCode: `MOCK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    };
  }
}

export const bitrefillService = new BitrefillService();
