import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api/client';
import { ADMIN_PAGE_SIZE, type Page } from '@shared/pagination';
import type { Ticket } from './use-tickets';

/** A ticket an admin sold over the counter: paid at once, with who it was sold to and who sold it. */
export type ManualTicket = Ticket & { passengerName: string | null; encodedByName: string | null };

export type ManualTicketInput = { originId: string; destinationId: string; quantity: number; passengerName?: string };

const KEY = ['manual-tickets'] as const;

/** The tickets sold over the counter, newest first, one page (10) at a time. */
export const useManualTickets = (page: number) =>
  useQuery({
    queryKey: [...KEY, page],
    queryFn: () => apiGet<Page<ManualTicket>>(`/manual-tickets?page=${page}&pageSize=${ADMIN_PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });

/** Sell a ticket. The fare is worked out on the server from the two stations; it is never sent. */
export const useCreateManualTicket = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualTicketInput) => apiPost<ManualTicket>('/manual-tickets', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

/** The ticket's QR code as a PNG (admins only; only while the ticket is paid). */
export const manualQrUrl = (ticketId: string) => `/api/manual-tickets/${ticketId}/qr.png`;
