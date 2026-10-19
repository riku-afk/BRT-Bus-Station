import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api/client';
import { formatCountdown, useNow } from '@/lib/use-now';
import { TICKETS_KEY } from '@/features/tickets/use-tickets';
import { formatPeso } from '@shared/money';

export type PaymentStatus = {
  ticketStatus: string;
  paymentStatus: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'needs_review' | null;
  provider: 'mock' | 'pisopay' | null;
  amountCentavos: number | null;
  channelCode: string | null;
  referenceNo: string | null;
  hasQr: boolean;
};

/** How often the page asks. The server checks with the payment provider at most every couple of seconds. */
const POLL_MS = 3000;

/** Where the ticket's payment stands. Asking also makes the server check with the provider, so a paid ticket shows up here. */
export function usePaymentStatus(ticketId: string, enabled: boolean) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['payment-status', ticketId],
    queryFn: () => apiGet<PaymentStatus>(`/tickets/${ticketId}/payment`),
    enabled,
    refetchInterval: POLL_MS,
  });
  // The moment the server says it is no longer awaiting payment, refresh the ticket itself.
  const ticketStatus = query.data?.ticketStatus;
  useEffect(() => {
    if (ticketStatus && ticketStatus !== 'pending_payment') void qc.invalidateQueries({ queryKey: TICKETS_KEY });
  }, [ticketStatus, qc]);
  return query;
}

type Props = {
  ticketId: string;
  fareCentavos: number;
  /** When the ticket expires if unpaid. */
  payBeforeAt: string | null;
  status: PaymentStatus | undefined;
};

/**
 * Pay for the ticket by QR Ph: the code is shown here, already carrying the fare, and the page waits until the payment is
 * confirmed. It never marks anything paid itself: the server learns of the payment from PisoPay.
 */
export function PayWithQr({ ticketId, fareCentavos, payBeforeAt, status }: Props) {
  const now = useNow(1000);
  const remaining = payBeforeAt ? new Date(payBeforeAt).getTime() - now : null;
  // A new payment (after a failed one) has a new reference, so the picture is asked for again.
  const src = `/api/tickets/${ticketId}/payment-qr.png?ref=${encodeURIComponent(status?.referenceNo ?? '')}`;

  return (
    <Card data-testid="pay-with-qr">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="size-5" aria-hidden /> Pay with QR Ph
        </CardTitle>
        <CardDescription>Open your bank or e-wallet app, choose Scan to pay, and scan this code. The amount is already filled in.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        {status?.hasQr ? (
          <>
            {/* White card so the code scans in dark mode too. */}
            <img src={src} alt={`QR Ph code to pay ${formatPeso(fareCentavos)}`} width={256} height={256} className="size-64 rounded-md border bg-white p-1" data-testid="pay-qr" />
            <p className="text-2xl font-semibold">{formatPeso(status.amountCentavos ?? fareCentavos)}</p>
            {status.referenceNo && (
              <p className="text-xs text-muted-foreground">
                Reference <span className="font-mono">{status.referenceNo}</span>
              </p>
            )}
            <Button asChild variant="outline" size="sm">
              <a href={src} download="pay-qrph.png">
                <Download /> Download QR (PNG)
              </a>
            </Button>
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Waiting for your payment…
              {remaining !== null && <span>(expires in {formatCountdown(remaining)})</span>}
            </p>
            {status.paymentStatus === 'needs_review' && (
              <p className="text-center text-sm text-destructive" role="alert">
                We received a payment that does not match this ticket's fare. It is being checked: please do not pay again.
              </p>
            )}
          </>
        ) : status ? (
          <p className="text-sm text-muted-foreground">No QR code is open for this ticket. Press Pay now to get one.</p>
        ) : (
          <p className="text-sm text-muted-foreground">Getting your QR code…</p>
        )}
      </CardContent>
    </Card>
  );
}
