import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api/client';
import { errorMessage } from '@/features/auth/use-auth';
import type { TicketStatus } from '@shared/tickets/status';

export type Ticket = {
  id: string;
  referenceCode: string;
  originStationId: string;
  originName: string;
  destinationStationId: string;
  destinationName: string;
  /** The total for everyone on the ticket (what is paid). */
  fareCentavos: number;
  /** How many passengers it admits: one QR code, scanned once, admits all of them. */
  quantity: number;
  status: TicketStatus;
  validUntil: string;
  paidAt: string | null;
  usedAt: string | null;
  createdAt: string;
  /** The bus the ticket was bought on: only that bus's konduktor can scan it. Null for a ticket with no bus. */
  busId: string | null;
  busName: string | null;
  /** While awaiting payment: when the ticket expires if unpaid. */
  payBeforeAt: string | null;
};

export type Checkout = { paymentId: string; ticketId: string; provider: 'mock' | 'pisopay'; amountCentavos: number; checkoutUrl: string; hasQr: boolean };

export const TICKETS_KEY = ['tickets'] as const;
/** How often the return page asks "is it paid yet?" while the webhook is on its way. */
export const POLL_MS = 1500;

export const useMyTickets = () => useQuery({ queryKey: [...TICKETS_KEY, 'mine'], queryFn: () => apiGet<Ticket[]>('/tickets/mine') });

/**
 * One ticket. With `poll`, keeps asking while it awaits payment (the return page after the provider): the page only
 * ever READS the status. Paying happens through the verified webhook, never through this page (PAY-03).
 */
export function useTicket(id: string | undefined, opts: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: [...TICKETS_KEY, 'one', id],
    queryFn: () => apiGet<Ticket>(`/tickets/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => (opts.poll && query.state.data?.status === 'pending_payment' ? POLL_MS : false),
  });
}

export type BuyResult = { ticket: Ticket; checkout: Checkout | null; checkoutError: string | null };

/** Buy on a bus waiting at a shelter (`busId`: its shelter and destination are the bus's), or between two stations. */
export type BuyRequest = { busId: string; quantity?: number } | { originId: string; destinationId: string; quantity?: number };

/** Buy = create the ticket, then start paying for it. If paying cannot start, the ticket still exists and can be paid later. */
export function useBuyTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (trip: BuyRequest): Promise<BuyResult> => {
      const ticket = await apiPost<Ticket>('/tickets', trip);
      try {
        return { ticket, checkout: await apiPost<Checkout>(`/tickets/${ticket.id}/checkout`), checkoutError: null };
      } catch (e) {
        return { ticket, checkout: null, checkoutError: errorMessage(e) };
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TICKETS_KEY }),
  });
}

/** Email the owner this paid ticket again. */
export function useEmailTicket() {
  return useMutation({ mutationFn: (ticketId: string) => apiPost<{ sent: boolean }>(`/tickets/${ticketId}/email`) });
}

export function usePayTicket() {
  return useMutation({ mutationFn: (ticketId: string) => apiPost<Checkout>(`/tickets/${ticketId}/checkout`) });
}

export function useCancelTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => apiPost<Ticket>(`/tickets/${ticketId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TICKETS_KEY }),
  });
}

/** Send the browser to a checkout: an app path (the demo page) stays in the SPA, a provider URL leaves it. */
export function goToCheckout(checkoutUrl: string, navigate: (to: string) => void) {
  if (checkoutUrl.startsWith('/')) navigate(checkoutUrl);
  else window.location.assign(checkoutUrl);
}
