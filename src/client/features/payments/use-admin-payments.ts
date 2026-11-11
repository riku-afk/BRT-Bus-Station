import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import { ADMIN_PAGE_SIZE, type Page } from '@shared/pagination';

export const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'cancelled', 'needs_review'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type AdminPayment = {
  id: string;
  ticketId: string;
  referenceCode: string;
  originName: string;
  destinationName: string;
  provider: 'mock' | 'pisopay';
  method: string | null;
  amountCentavos: number;
  status: PaymentStatus;
  reviewReason: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Which payments the list, the report and the CSV export cover. Days are Manila `YYYY-MM-DD`, both inclusive. */
export type AdminPaymentFilter = {
  status?: PaymentStatus;
  provider?: 'mock' | 'pisopay';
  method?: string;
  from?: string;
  to?: string;
  /** Part of a ticket reference code. */
  q?: string;
};

export type PaymentReport = {
  totals: { count: number; amountCentavos: number; paidCount: number; paidCentavos: number; pendingCentavos: number; needsReviewCount: number; needsReviewCentavos: number };
  byStatus: { status: PaymentStatus; count: number; amountCentavos: number }[];
  byMethod: { method: string; count: number; amountCentavos: number }[];
  byDay: { day: string; count: number; paidCount: number; paidCentavos: number }[];
  methods: string[];
};

/** The filter as query-string pairs; empty fields are left out. */
export function filterParams(filter: AdminPaymentFilter): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (v) params.set(key, v);
  }
  return params;
}

export const useAdminPayments = (filter: AdminPaymentFilter, page = 1) =>
  useQuery({
    queryKey: ['payments', 'admin', filter, page],
    queryFn: () => {
      const params = filterParams(filter);
      params.set('page', String(page));
      params.set('pageSize', String(ADMIN_PAGE_SIZE));
      return apiGet<Page<AdminPayment>>(`/payments?${params}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: 5000,
  });

export const useAdminPaymentReport = (filter: AdminPaymentFilter) =>
  useQuery({
    queryKey: ['payments', 'admin', 'report', filter],
    queryFn: () => {
      const params = filterParams(filter).toString();
      return apiGet<PaymentReport>(`/payments/report${params ? `?${params}` : ''}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });

/** Where the browser downloads the filtered payments as CSV (the session cookie goes with it). */
export function paymentsExportUrl(filter: AdminPaymentFilter): string {
  const params = filterParams(filter).toString();
  return `/api/payments/export.csv${params ? `?${params}` : ''}`;
}

/** Plain-language reason a payment needs an admin's attention. */
export function reviewReasonText(reason: string | null): string {
  switch (reason) {
    case 'amount_mismatch':
      return 'The amount paid did not match the ticket fare. The ticket was not marked paid.';
    case 'paid_after_close':
      return 'Paid after the ticket was cancelled or had expired. The ticket stays closed.';
    case 'ticket_paid':
      return 'The ticket was already paid: this looks like a double payment.';
    case 'ticket_expired':
      return 'Paid for a ticket that had already expired.';
    case 'ticket_cancelled':
      return 'Paid for a ticket that had already been cancelled.';
    default:
      return reason ?? '';
  }
}
