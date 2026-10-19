import { useMutation, useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api/client';

export type MockMethod = 'gcash' | 'maya' | 'qrph';

export type MockSession = {
  providerRef: string;
  payable: boolean;
  paymentStatus: string;
  ticketStatus: string;
  amountCentavos: number;
  referenceCode: string;
  originName: string;
  destinationName: string;
  returnPath: string;
  methods: MockMethod[];
};

export const METHOD_LABEL: Record<MockMethod, string> = { gcash: 'GCash', maya: 'Maya', qrph: 'QR Ph' };

export const useMockSession = (ref: string | undefined) =>
  useQuery({ queryKey: ['payments', 'mock', ref], queryFn: () => apiGet<MockSession>(`/payments/mock/sessions/${ref}`), enabled: Boolean(ref), retry: false });

/** Presses Pay or Fail on the demo page. The server turns it into a signed webhook; this call never marks anything paid. */
export const useCompleteMock = (ref: string | undefined) =>
  useMutation({
    mutationFn: (body: { outcome: 'paid' | 'failed'; method: MockMethod }) =>
      apiPost<{ outcome: string; returnPath: string }>(`/payments/mock/sessions/${ref}/complete`, body),
  });
