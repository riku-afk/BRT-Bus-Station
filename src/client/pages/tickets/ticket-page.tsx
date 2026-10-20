import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Bus, CheckCircle2, Clock, Download, Loader2, Mail, XCircle, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { PayWithQr, usePaymentStatus } from '@/features/payments/pay-with-qr';
import { TicketStatusBadge } from '@/features/tickets/ticket-status';
import { goToCheckout, useCancelTicket, useEmailTicket, usePayTicket, useTicket } from '@/features/tickets/use-tickets';
import { shortName } from '@/features/tickets/ticket-card';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { formatManilaDateTime, formatManilaTime } from '@shared/datetime/ph-time';
import { formatPeso } from '@shared/money';

/** A status banner across the top of the ticket page. */
function Banner({ tone, icon: Icon, title, children, spin }: { tone: 'green' | 'red' | 'amber' | 'slate' | 'neutral'; icon: LucideIcon; title: string; children?: React.ReactNode; spin?: boolean }) {
  const style = {
    green: 'bg-[#15803d] text-white',
    red: 'border border-[#e11d48]/50 bg-[#e11d48]/10 text-foreground',
    amber: 'border border-[#f59e0b]/60 bg-[#f59e0b]/10 text-foreground',
    slate: 'bg-[#475569] text-white',
    neutral: 'border bg-card text-foreground',
  }[tone];
  const chip = { green: 'bg-white/20', red: 'bg-[#e11d48] text-white', amber: 'bg-[#f59e0b] text-[#1c1203]', slate: 'bg-white/20', neutral: 'bg-[#0369a1] text-white' }[tone];
  return (
    <div role="status" aria-live="polite" className={cn('flex items-center gap-3.5 rounded-[18px] px-4 py-4 sm:px-5', style)}>
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', chip)}>
        <Icon className={cn('size-[22px]', spin && 'animate-spin')} strokeWidth={2.6} aria-hidden />
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <p className="text-base font-extrabold sm:text-[17px]">{title}</p>
        {children && <div className={cn('text-sm', tone === 'green' || tone === 'slate' ? 'text-white/85' : 'text-muted-foreground')}>{children}</div>}
      </div>
    </div>
  );
}

const ACTION = 'flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border bg-card px-4 text-sm font-extrabold hover:bg-surface-2 disabled:opacity-60';

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
  const showPayQr = pending && (paymentStatus.isLoading || Boolean(paymentStatus.data?.hasQr));

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
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5 px-4 pb-8 pt-5 sm:px-6 md:px-8 md:pt-7">
      {pending && returning && !waitedTooLong && (
        <Banner tone="neutral" icon={Loader2} spin title="Confirming your payment…">
          This usually takes a few seconds. You can stay on this page.
        </Banner>
      )}

      {pending && failed && (
        <Banner tone="red" icon={XCircle} title="The payment did not go through.">
          You have not been charged. Your ticket is still waiting: try again below.
        </Banner>
      )}

      {waitedTooLong && (
        <Banner tone="amber" icon={Clock} title="Still waiting for the payment confirmation.">
          If you completed the payment, it can take a little longer. If you did not, you can pay again below.
        </Banner>
      )}

      {ticket.status === 'paid' && (
        <Banner tone="green" icon={CheckCircle2} title="Payment received. Your ticket is paid.">
          {ticket.busName ? `Valid on ${ticket.busName} at ${ticket.originName}` : 'Valid'} until {formatManilaTime(ticket.validUntil)} today.
        </Banner>
      )}

      {ticket.status === 'used' && (
        <Banner tone="slate" icon={CheckCircle2} title={ticket.usedAt ? `Used at ${formatManilaTime(ticket.usedAt)}` : 'This ticket has been used.'}>
          It can no longer be used again.
        </Banner>
      )}

      {(ticket.status === 'expired' || ticket.status === 'cancelled') && (
        <Banner tone="slate" icon={XCircle} title={ticket.status === 'expired' ? 'This ticket has expired.' : 'This ticket was cancelled.'}>
          It can no longer be used.
        </Banner>
      )}

      {showPayQr && (
        <PayWithQr ticketId={ticket.id} fareCentavos={ticket.fareCentavos} payBeforeAt={ticket.payBeforeAt} status={paymentStatus.data} />
      )}

      <section className="flex flex-wrap items-start gap-5">
        <article className="min-w-0 flex-[1_1_340px] overflow-hidden rounded-[26px] border bg-card shadow-[0_20px_40px_-24px_rgba(15,23,42,.35)] md:max-w-[460px]" aria-label={ticket.status === 'paid' || ticket.status === 'used' ? `Ticket ${ticket.referenceCode}` : 'Ticket'}>
          <div className="flex flex-col gap-3.5 bg-[#0369a1] px-5 py-5 text-white sm:px-6 sm:py-[22px]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[13px] font-extrabold">
                <span className="grid size-[26px] place-items-center rounded-lg bg-[#facc15] text-[#1c1203]">
                  <Bus className="size-3.5" strokeWidth={2.4} aria-hidden />
                </span>
                BRT Bus Station
              </span>
              <TicketStatusBadge status={ticket.status} className="bg-[#dcfce7] text-[11px] font-extrabold uppercase tracking-wider text-[#166534]" />
            </div>
            <div className="flex items-end justify-between gap-2.5">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#bae6fd]">From</span>
                <span className="text-[38px] font-extrabold leading-none tracking-tight" aria-hidden>
                  {shortName(ticket.originName)}
                </span>
                <span className="text-xs text-[#e0f2fe]">{ticket.originName}</span>
              </div>
              <ArrowRight className="mb-[18px] size-8 shrink-0 text-[#facc15]" strokeWidth={3} role="img" aria-label="to" />
              <div className="flex flex-col items-end text-right">
                <span className="text-xs font-bold text-[#bae6fd]">To</span>
                <span className="text-[38px] font-extrabold leading-none tracking-tight" aria-hidden>
                  {shortName(ticket.destinationName)}
                </span>
                <span className="text-xs text-[#e0f2fe]">{ticket.destinationName}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3.5 px-5 pb-4 pt-5 sm:px-6">
            <span className="text-sm font-bold">
              {ticket.busName ? `For ${ticket.busName} only. Board at ` : 'Board at '}
              <strong>{ticket.originName}</strong>
            </span>
            {ticket.status === 'paid' && (
              <>
                {/* A white card so the code scans in dark mode too. */}
                <img src={`/api/tickets/${ticket.id}/qr.png`} alt={`QR code for ticket ${ticket.referenceCode}`} width={248} height={248} className="size-[248px] max-w-full rounded-[18px] border border-[#e3e6f0] bg-white p-3.5" data-testid="ticket-qr" />
                <span className="text-center text-[13px] text-muted-foreground">
                  {ticket.busName ? `Show this to the konduktor of ${ticket.busName} at ${ticket.originName} when you board. ` : 'Show this to the konduktor when you board. '}
                  {ticket.quantity > 1 ? `One scan admits all ${ticket.quantity} of you. ` : ''}Use it once.
                </span>
              </>
            )}
          </div>

          {/* The reference is the fallback for the konduktor, so it only appears once the ticket is paid. */}
          {(ticket.status === 'paid' || ticket.status === 'used') && (
            <>
              <div className="relative mx-[18px] h-0 border-t-2 border-dashed" aria-hidden>
                <span className="absolute -left-8 -top-[13px] size-[26px] rounded-full bg-background" />
                <span className="absolute -right-8 -top-[13px] size-[26px] rounded-full bg-background" />
              </div>

              <div className="flex flex-col items-center gap-1 px-6 pb-[22px] pt-[18px]">
                <span className="text-xs font-bold text-muted-foreground">Reference</span>
                <span className="font-mono text-[26px] font-bold tracking-[0.12em]">{ticket.referenceCode}</span>
                <span className="text-center text-xs text-muted-foreground">If the camera can’t read the QR, give the konduktor this code.</span>
              </div>
            </>
          )}
        </article>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-[20px] border bg-card p-5">
            <h2 className="text-[17px] font-extrabold">Ticket details</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-0.5 rounded-[14px] px-3.5 py-3" style={{ background: 'color-mix(in srgb, #be185d 10%, var(--surface))' }}>
                <span className="text-xs font-semibold text-muted-foreground">{ticket.quantity > 1 ? 'Total fare' : 'Fare'}</span>
                <span className="text-xl font-extrabold">{formatPeso(ticket.fareCentavos)}</span>
              </div>
              {ticket.quantity > 1 && (
                <div className="flex flex-col gap-0.5 rounded-[14px] px-3.5 py-3" style={{ background: 'color-mix(in srgb, #0369a1 10%, var(--surface))' }}>
                  <span className="text-xs font-semibold text-muted-foreground">Passengers</span>
                  <span className="text-xl font-extrabold" data-testid="ticket-passengers">
                    {ticket.quantity} ({formatPeso(Math.round(ticket.fareCentavos / ticket.quantity))} each)
                  </span>
                </div>
              )}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-[18px] gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Bought</dt>
              <dd className="font-bold">{formatManilaDateTime(ticket.createdAt)}</dd>
              {ticket.paidAt && (
                <>
                  <dt className="text-muted-foreground">Paid</dt>
                  <dd className="font-bold">{formatManilaDateTime(ticket.paidAt)}</dd>
                  <dt className="text-muted-foreground">Valid until</dt>
                  <dd className="font-bold text-[#15803d] dark:text-[#4ade80]">{formatManilaDateTime(ticket.validUntil)}</dd>
                </>
              )}
            </dl>

            {pending && (
              <div className="flex gap-2 border-t pt-3">
                {/* While the payment QR is on the page it is the way to pay; Pay now is only for when there is no QR to show. */}
                {!showPayQr && (
                  <button type="button" onClick={payNow} disabled={pay.isPending || cancel.isPending} className="h-12 flex-1 rounded-xl bg-[#be185d] px-4 text-sm font-extrabold text-white hover:brightness-110 disabled:opacity-60">
                    {pay.isPending ? 'Opening payment…' : waitedTooLong || failed ? 'Pay again' : 'Pay now'}
                  </button>
                )}
                <button type="button" onClick={cancelTicket} disabled={cancel.isPending || pay.isPending} className="h-12 flex-1 rounded-xl bg-[#e11d48] px-4 text-sm font-extrabold text-white transition hover:bg-[#be123c] disabled:opacity-60">
                  Cancel ticket
                </button>
              </div>
            )}
          </div>

          {ticket.status === 'paid' && (
            <div className="flex flex-col gap-2.5 rounded-[20px] border bg-card p-5">
              <h2 className="text-[17px] font-extrabold">Keep a copy</h2>
              <a href={`/api/tickets/${ticket.id}/qr.png`} download={`ticket-${ticket.referenceCode}.png`} className={ACTION}>
                <Download className="size-[18px]" aria-hidden /> Download QR (PNG)
              </a>
              <button
                type="button"
                className={ACTION}
                disabled={email.isPending}
                onClick={() =>
                  email.mutate(ticket.id, {
                    onSuccess: ({ sent }) => (sent ? toast.success('Sent. Check your inbox.') : toast.error('Could not send the email just now. Please try again.')),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                <Mail className="size-[18px]" aria-hidden /> {email.isPending ? 'Sending…' : 'Email me this ticket'}
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2.5">
            <Link to="/tickets" className="flex h-12 min-w-[140px] flex-1 items-center justify-center rounded-xl bg-[#be185d] px-4 text-sm font-extrabold text-white hover:brightness-110">
              My tickets
            </Link>
            <Link to="/" className={cn(ACTION, 'min-w-[140px] flex-1')}>
              Back to the map
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
