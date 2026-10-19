import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Download, Mail, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { PayWithQr, usePaymentStatus } from '@/features/payments/pay-with-qr';
import { TicketStatusBadge } from '@/features/tickets/ticket-status';
import { goToCheckout, useCancelTicket, useEmailTicket, usePayTicket, useTicket } from '@/features/tickets/use-tickets';
import { formatCountdown, useNow } from '@/lib/use-now';
import { formatManilaDateTime, formatManilaTime } from '@shared/datetime/ph-time';
import { formatPeso } from '@shared/money';

/** How long the return page waits for the provider's confirmation before offering a way out. */
const WAIT_BEFORE_HELP_MS = 45_000;

/**
 * One ticket. After paying, the provider (or the demo page) sends the passenger back here; this page only READS the
 * ticket and keeps asking until the server says it is paid. It can never mark anything paid itself (PAY-03).
 */
export function TicketPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const returning = search.get('return') === '1';
  const failed = search.get('failed') === '1';
  const navigate = useNavigate();
  const { data: ticket, isLoading, error } = useTicket(id, { poll: true });
  const pay = usePayTicket();
  const cancel = useCancelTicket();
  const email = useEmailTicket();
  const now = useNow(1000);
  const paymentStatus = usePaymentStatus(id ?? '', ticket?.status === 'pending_payment');
  const [openedAt] = useState(() => Date.now());
  const location = useLocation();

  // The payment window is 15 minutes (the ticket's `payBeforeAt`). If it runs out while the passenger is looking at the
  // payment, send them back to where they came from: the ticket can no longer be paid. (A ticket that was already expired
  // when opened, e.g. from the list, just shows as expired.)
  const wasPending = useRef(false);
  const timedOut = useRef(false);
  useEffect(() => {
    if (!ticket) return;
    if (ticket.status === 'pending_payment') wasPending.current = true;
    const windowOver = ticket.status === 'pending_payment' && ticket.payBeforeAt !== null && now >= new Date(ticket.payBeforeAt).getTime();
    const expired = wasPending.current && ticket.status === 'expired';
    if ((windowOver || expired) && !timedOut.current) {
      timedOut.current = true;
      toast.info('Your 15 minutes to pay ran out, so this ticket has expired. You can buy a new one.');
      // Back to the previous page; if this page was opened directly there is none, so go to the ticket list.
      if (location.key !== 'default') navigate(-1);
      else navigate('/tickets', { replace: true });
    }
  }, [ticket, now, navigate, location.key]);

  if (isLoading) return <Skeleton className="mx-auto mt-6 h-64 max-w-md" />;
  if (error || !ticket) {
    return (
      <div className="mx-auto max-w-md p-4">
        <p className="text-sm text-destructive">{error ? errorMessage(error) : 'Ticket not found'}</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/tickets">My tickets</Link>
        </Button>
      </div>
    );
  }

  const pending = ticket.status === 'pending_payment';
  const waitedTooLong = pending && returning && now - openedAt > WAIT_BEFORE_HELP_MS;
  const remaining = ticket.payBeforeAt ? new Date(ticket.payBeforeAt).getTime() - now : 0;

  function payNow() {
    pay.mutate(ticket!.id, {
      onSuccess: (checkout) => goToCheckout(checkout.checkoutUrl, navigate),
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  function cancelTicket() {
    cancel.mutate(ticket!.id, {
      onSuccess: () => toast.success('Ticket cancelled'),
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      {pending && returning && !waitedTooLong && (
        <Card role="status" aria-live="polite">
          <CardContent className="flex items-center gap-3 pt-6">
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
            <div>
              <p className="font-medium">Confirming your payment…</p>
              <p className="text-sm text-muted-foreground">This usually takes a few seconds. You can stay on this page.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {pending && failed && (
        <Card role="status" className="border-destructive/50">
          <CardContent className="flex items-center gap-3 pt-6">
            <XCircle className="size-7 text-destructive" aria-hidden />
            <div>
              <p className="font-semibold">The payment did not go through.</p>
              <p className="text-sm text-muted-foreground">You have not been charged. Your ticket is still waiting: try again below.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {waitedTooLong && (
        <Card role="status" className="border-warning/60">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">Still waiting for the payment confirmation.</p>
            <p className="text-muted-foreground">If you completed the payment, it can take a little longer. If you did not, you can pay again below.</p>
          </CardContent>
        </Card>
      )}

      {ticket.status === 'paid' && (
        <Card className="border-success/50" role="status">
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle2 className="size-7 text-success" aria-hidden />
            <div>
              <p className="font-semibold">Payment received. Your ticket is paid.</p>
              <p className="text-sm text-muted-foreground">
                {ticket.busName ? `Valid on ${ticket.busName} at ${ticket.originName}` : 'Valid'} until {formatManilaTime(ticket.validUntil)} today.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {ticket.status === 'used' && (
        <Card role="status">
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle2 className="size-7 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-semibold">{ticket.usedAt ? `Used at ${formatManilaTime(ticket.usedAt)}` : 'This ticket has been used.'}</p>
              <p className="text-sm text-muted-foreground">It can no longer be used again.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {(ticket.status === 'expired' || ticket.status === 'cancelled') && (
        <Card role="status">
          <CardContent className="flex items-center gap-3 pt-6">
            <XCircle className="size-7 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-semibold">{ticket.status === 'expired' ? 'This ticket has expired.' : 'This ticket was cancelled.'}</p>
              <p className="text-sm text-muted-foreground">It can no longer be used.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {pending && (paymentStatus.isLoading || paymentStatus.data?.hasQr) && (
        <PayWithQr ticketId={ticket.id} fareCentavos={ticket.fareCentavos} payBeforeAt={ticket.payBeforeAt} status={paymentStatus.data} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            {ticket.originName} → {ticket.destinationName}
            <TicketStatusBadge status={ticket.status} />
          </CardTitle>
          <CardDescription>
            {ticket.busName
              ? `For ${ticket.busName} only. Show the QR code to its konduktor at ${ticket.originName}, where you board.`
              : `Board at ${ticket.originName}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md border bg-muted/40 p-3 text-center">
            <p className="text-xs text-muted-foreground">Reference</p>
            <p className="font-mono text-2xl font-semibold tracking-widest">{ticket.referenceCode}</p>
          </div>
          {ticket.status === 'paid' && (
            <div className="flex flex-col items-center gap-2">
              {/* White card so the code scans in dark mode too. */}
              <img src={`/api/tickets/${ticket.id}/qr.png`} alt={`QR code for ticket ${ticket.referenceCode}`} width={256} height={256} className="size-64 rounded-md border bg-white p-1" data-testid="ticket-qr" />
              <p className="text-xs text-muted-foreground">
                {ticket.busName ? `Show this to the konduktor of ${ticket.busName} at ${ticket.originName} when you board. ` : 'Show this to the konduktor when you board. '}
                {ticket.quantity > 1 ? `One scan admits all ${ticket.quantity} of you. ` : ''}Use it once.
              </p>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/tickets/${ticket.id}/qr.png`} download={`ticket-${ticket.referenceCode}.png`}>
                  <Download /> Download QR (PNG)
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={email.isPending}
                onClick={() =>
                  email.mutate(ticket.id, {
                    onSuccess: ({ sent }) => (sent ? toast.success('Sent. Check your inbox.') : toast.error('Could not send the email just now. Please try again.')),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                <Mail /> {email.isPending ? 'Sending…' : 'Email me this ticket'}
              </Button>
            </div>
          )}
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
            {ticket.quantity > 1 && (
              <>
                <dt className="text-muted-foreground">Passengers</dt>
                <dd className="font-medium" data-testid="ticket-passengers">
                  {ticket.quantity} ({formatPeso(Math.round(ticket.fareCentavos / ticket.quantity))} each)
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">{ticket.quantity > 1 ? 'Total fare' : 'Fare'}</dt>
            <dd className="font-medium">{formatPeso(ticket.fareCentavos)}</dd>
            <dt className="text-muted-foreground">Bought</dt>
            <dd>{formatManilaDateTime(ticket.createdAt)}</dd>
            {ticket.paidAt && (
              <>
                <dt className="text-muted-foreground">Paid</dt>
                <dd>{formatManilaDateTime(ticket.paidAt)}</dd>
                <dt className="text-muted-foreground">Valid until</dt>
                <dd>{formatManilaDateTime(ticket.validUntil)}</dd>
              </>
            )}
          </dl>

          {pending && (
            <div className="flex flex-col gap-2">
              {!returning && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="size-4" aria-hidden /> Pay within <strong className="text-foreground">{formatCountdown(remaining)}</strong> or the ticket expires.
                </p>
              )}
              <div className="flex gap-2">
                <Button onClick={payNow} disabled={pay.isPending || cancel.isPending}>
                  {pay.isPending ? 'Opening payment…' : waitedTooLong || failed ? 'Pay again' : 'Pay now'}
                </Button>
                <Button variant="ghost" onClick={cancelTicket} disabled={cancel.isPending || pay.isPending}>
                  Cancel ticket
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/tickets">My tickets</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">Back to the map</Link>
        </Button>
      </div>
    </div>
  );
}
