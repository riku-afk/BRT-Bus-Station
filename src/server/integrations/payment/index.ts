import { env } from '@config/env';
import { ApiError } from '@lib/response';
import { MockPaymentProvider } from './mock.provider';
import { PisoPayPaymentProvider } from './pisopay.provider';
import type { PaymentProvider, PaymentProviderName } from './payment-provider';

export type { CheckoutRequest, CheckoutSession, HeaderReader, InquiryResult, PaymentEvent, PaymentProvider, PaymentProviderName, QrCheckout } from './payment-provider';
export { formatExpiry, PisoPayPaymentProvider, traceNoFor } from './pisopay.provider';
export { MOCK_METHODS, MOCK_SIGNATURE_HEADER, MockPaymentProvider, SIGNATURE_TOLERANCE_SECONDS, type MockMethod } from './mock.provider';

let mock: MockPaymentProvider | null = null;
let pisopay: PisoPayPaymentProvider | null = null;

/** The provider selected by `PAYMENT_PROVIDER` (used for new checkouts). */
export function getPaymentProvider(name: PaymentProviderName = env.payment.provider): PaymentProvider {
  if (name === 'mock') return (mock ??= new MockPaymentProvider(env.payment.webhookSecret));
  if (name === 'pisopay') {
    const { username, password, baseUrl, processorName, qrChannels } = env.payment.pisopay;
    if (!username || !password) throw new ApiError(501, 'PROVIDER_NOT_CONFIGURED', 'PisoPay is selected but PISOPAY_API_USERNAME / PISOPAY_API_PASSWORD are not set');
    return (pisopay ??= new PisoPayPaymentProvider({ baseUrl, username, password, processorName, channels: qrChannels }));
  }
  throw new ApiError(501, 'PROVIDER_NOT_AVAILABLE', `Payment provider "${name}" is not available`);
}

/** The mock provider as its own type: the demo gateway needs its signing helpers. */
export function getMockProvider(): MockPaymentProvider {
  return getPaymentProvider('mock') as MockPaymentProvider;
}

export function isMockEnabled(): boolean {
  return env.payment.provider === 'mock';
}
