import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { METHOD_LABEL, useCompleteMock, useMockSession, type MockMethod } from '@/features/payments/use-mock-payment';
import { formatPeso } from '@shared/money';

/**
 * The demo payment gateway (PAY-08), standing in for GCash / Maya / QR Ph while the provider is `mock`. It looks like a
 * separate site on purpose: pressing Pay does not change the ticket here. The server turns the press into a SIGNED
 * webhook and sends it through the same path a real provider uses; the ticket page then waits for the result.
 */
export function MockPaymentPage() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const { data: session, isLoading, error } = useMockSession(ref);
  const complete = useCompleteMock(ref);
  const [method, setMethod] = useState<MockMethod>('gcash');

  function press(outcome: 'paid' | 'failed') {
    complete.mutate(
      { outcome, method },
      {
        onSuccess: (result) => navigate(result.returnPath, { replace: true }),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted/40 p-4">
      <div className="flex items-center gap-2 rounded-full bg-warning/20 px-3 py-1 text-xs font-medium text-warning">
        <FlaskConical className="size-3.5" aria-hidden /> Demo payment gateway · test mode · no real money is charged
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Complete your payment</CardTitle>
          <CardDescription>BRT Bus Station ticket</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoading && <Skeleton className="h-40 w-full" />}
          {error && <p className="text-sm text-destructive">This payment link is not valid.</p>}

          {session && (
            <>
              <div className="rounded-md border p-3">
                <p className="text-sm text-muted-foreground">
                  {session.originName} → {session.destinationName}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{session.referenceCode}</p>
                <p className="mt-1 text-3xl font-semibold">{formatPeso(session.amountCentavos)}</p>
              </div>

              {session.payable ? (
                <>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-medium">Pay with</legend>
                    {session.methods.map((m) => (
                      <label key={m} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
                        <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} />
                        {METHOD_LABEL[m]}
                      </label>
                    ))}
                  </fieldset>
                  <Button size="lg" onClick={() => press('paid')} disabled={complete.isPending}>
                    {complete.isPending ? 'Processing…' : `Pay ${formatPeso(session.amountCentavos)}`}
                  </Button>
                  <Button variant="outline" onClick={() => press('failed')} disabled={complete.isPending}>
                    Fail this payment (demo)
                  </Button>
                </>
              ) : (
                <div className="rounded-md border border-warning/60 p-3 text-sm">
                  <p className="font-medium">This payment can no longer be made.</p>
                  <p className="text-muted-foreground">The ticket is {session.ticketStatus.replace('_', ' ')}.</p>
                  <Button asChild variant="outline" size="sm" className="mt-2">
                    <Link to={session.returnPath}>Back to the ticket</Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
