import { config } from '../../config';

/**
 * Reloadly Gift Card Service
 *
 * Reloadly is a self-serve gift card API — no approval process, instant sandbox access,
 * production access same day after signup at reloadly.com.
 *
 * Auth: OAuth2 client credentials
 * Sandbox:    https://auth.reloadly.com  →  https://giftcards-sandbox.reloadly.com
 * Production: https://auth.reloadly.com  →  https://giftcards.reloadly.com
 *
 * Brands supported: Amazon, Netflix, Apple, Google Play, Microsoft, and 700+ more.
 */

const IS_SANDBOX = !config.reloadlyClientSecret || process.env.NODE_ENV !== 'production';

const AUTH_URL    = 'https://auth.reloadly.com/oauth/token';
const API_BASE    = IS_SANDBOX
  ? 'https://giftcards-sandbox.reloadly.com'
  : 'https://giftcards.reloadly.com';

// Reloadly product IDs for our supported brands (confirmed available on their platform)
export const CATALOG = [
  { id: 'amazon-us',      reloadlyId: 1,    name: 'Amazon',       category: 'shopping',  minValue: 5,  maxValue: 500, logoUrl: '' },
  { id: 'netflix-us',     reloadlyId: 13,   name: 'Netflix',      category: 'streaming', minValue: 15, maxValue: 100, logoUrl: '' },
  { id: 'apple-us',       reloadlyId: 4,    name: 'Apple',        category: 'apps',      minValue: 10, maxValue: 200, logoUrl: '' },
  { id: 'google-play-us', reloadlyId: 10,   name: 'Google Play',  category: 'apps',      minValue: 10, maxValue: 200, logoUrl: '' },
  { id: 'microsoft-us',   reloadlyId: 77,   name: 'Microsoft',    category: 'gaming',    minValue: 10, maxValue: 100, logoUrl: '' },
] as const;

type CatalogItem = typeof CATALOG[number];

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  if (!config.reloadlyClientId || !config.reloadlyClientSecret) {
    throw new Error('Reloadly credentials not configured');
  }

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.reloadlyClientId,
      client_secret: config.reloadlyClientSecret,
      grant_type: 'client_credentials',
      audience: IS_SANDBOX
        ? 'https://giftcards-sandbox.reloadly.com'
        : 'https://giftcards.reloadly.com',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Reloadly auth failed: ${err}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

async function reloadlyFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/com.reloadly.giftcards-v1+json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Reloadly API error (${res.status}): ${err.slice(0, 200)}`);
  }

  return res.json();
}

export class ReloadlyService {
  private isLive(): boolean {
    return !!(config.reloadlyClientId && config.reloadlyClientSecret);
  }

  getCatalog(): CatalogItem[] {
    return [...CATALOG];
  }

  /**
   * Purchase a gift card and return the redemption code.
   * In sandbox mode returns a test code without hitting the real API.
   */
  async placeOrder(params: {
    productId: string;
    valueUsd: number;
    recipientEmail: string;
  }): Promise<{ redemptionCode: string; orderId: string }> {
    const product = CATALOG.find(p => p.id === params.productId);
    if (!product) throw new Error(`Unknown product: ${params.productId}`);

    if (params.valueUsd < product.minValue) {
      throw new Error(`Minimum value for ${product.name} is $${product.minValue}`);
    }
    if (params.valueUsd > product.maxValue) {
      throw new Error(`Maximum value for ${product.name} is $${product.maxValue}`);
    }

    // Sandbox / no credentials — return mock code
    if (!this.isLive()) {
      console.log(`[Reloadly] SANDBOX order: ${product.name} $${params.valueUsd} → ${params.recipientEmail}`);
      return {
        redemptionCode: `DEMO-${product.id.toUpperCase().slice(0, 4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}-XXXX`,
        orderId: `sandbox-${Date.now()}`,
      };
    }

    const data = await reloadlyFetch('/orders', {
      method: 'POST',
      body: JSON.stringify({
        productId: product.reloadlyId,
        quantity: 1,
        unitPrice: params.valueUsd,
        customIdentifier: `savings-${Date.now()}`,
        recipientEmail: params.recipientEmail,
        recipientPhoneDetails: { countryCode: 'US', phoneNumber: '' },
        senderName: 'Spreads',
      }),
    });

    const code = data.redemptionCode ?? data.redeemCode ?? data.pinCode;
    if (!code) throw new Error(`Reloadly order succeeded but no code returned: ${JSON.stringify(data)}`);

    return {
      redemptionCode: String(code),
      orderId: String(data.transactionId ?? data.orderId ?? Date.now()),
    };
  }
}

export const reloadlyService = new ReloadlyService();
