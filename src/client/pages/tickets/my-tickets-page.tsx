import { useConfirm } from '@/components/confirm-dialog';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { TicketCard } from '@/features/tickets/ticket-card';
import { goToCheckout, useCancelTicket, useMyTickets, usePayTicket, type Ticket } from '@/features/tickets/use-tickets';

/** Passenger: all my tickets, newest first (TKT-05). */
export function MyTicketsPage() {
  const { data: tickets, isLoading, error } = useMyTickets();
  const pay = usePayTicket();
  const cancel = useCancelTicket();
  const { ask, dialog } = useConfirm();
  const navigate = useNavigate();

  function payNow(ticket: Ticket) {
    pay.mutate(ticket.id, {
      onSuccess: (checkout) => goToCheckout(checkout.checkoutUrl, navigate),
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  async function cancelTicket(ticket: Ticket) {
    const ok = await ask({ title: "Cancel this ticket?", description: `${ticket.originName} → ${ticket.destinationName}`, confirmLabel: "Cancel ticket", cancelLabel: "Keep it", destructive: true });
    if (!ok) return;
    cancel.mutate(ticket.id, { onSuccess: () => toast.success('Ticket cancelled'), onError: (e) => toast.error(errorMessage(e)) });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
      {dialog}
      <h1 className="text-xl font-semibold">My tickets</h1>
      {isLoading && <Skeleton className="h-28 w-full" />}
      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
      {tickets?.length === 0 && (
        <div className="rounded-lg border p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">You have not bought a ticket yet.</p>
          <Button asChild>
            <Link to="/">Pick your stations on the map</Link>
          </Button>
        </div>
      )}
      {tickets?.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} onPay={payNow} onCancel={cancelTicket} busy={pay.isPending || cancel.isPending} />
      ))}
    </div>
  );
}
