import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import { ADMIN_PAGE_SIZE, type Page } from '@shared/pagination';

export type AdminPayment = {
  id: string;
  ticketId: string;
  referenceCode: string;
  originName: string;
  destinationName: string;
  provider: 'mock' | 'pisopay';
  method: string | null;
  amountCentavos: number;
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'needs_review';
  reviewReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export const useAdminPayments = (needsReviewOnly: boolean, page = 1) =>
  useQuery({
    queryKey: ['payments', 'admin', needsReviewOnly, page],
    queryFn: () => apiGet<Page<AdminPayment>>(`/payments?page=${page}&pageSize=${ADMIN_PAGE_SIZE}${needsReviewOnly ? '&needsReview=true' : ''}`),
    placeholderData: keepPreviousData,
    refetchInterval: 5000,
  });

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
