import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FlaskConical, Wallet } from 'lucide-react';
import { toast } from 'sonner';
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
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 py-8">
      <div className="flex items-center gap-2 rounded-full bg-[#fef3c7] px-3.5 py-1.5 text-center text-xs font-bold text-[#92400e] dark:bg-[#f59e0b]/20 dark:text-[#fcd34d]">
        <FlaskConical className="size-3.5 shrink-0" aria-hidden /> Demo payment gateway · test mode · no real money is charged
      </div>

      <div className="w-full max-w-sm overflow-hidden rounded-[26px] border bg-card shadow-[0_20px_40px_-24px_rgba(15,23,42,.35)]">
        <div className="flex items-center gap-3 bg-[#be185d] px-5 py-[18px] text-white">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20">
            <Wallet className="size-5" aria-hidden />
          </span>
          <div className="flex flex-col">
            <h1 className="text-lg font-extrabold">Complete your payment</h1>
            <span className="text-[13px] text-white/85">Cavite Smart Transport Terminal ticket</span>
          </div>
        </div>
        <div className="flex flex-col gap-4 p-5">
          {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
          {error && <p className="text-sm text-destructive">This payment link is not valid.</p>}

          {session && (
            <>
              <div className="rounded-2xl p-4" style={{ background: 'color-mix(in srgb, #be185d 9%, var(--surface))' }}>
                <p className="text-sm text-muted-foreground">
                  {session.originName} → {session.destinationName}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{session.referenceCode}</p>
                <p className="mt-1 text-[34px] font-extrabold leading-tight">{formatPeso(session.amountCentavos)}</p>
              </div>

              {session.payable ? (
                <>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-[13px] font-extrabold">Pay with</legend>
                    {session.methods.map((m) => (
                      <label key={m} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2 text-sm font-semibold has-[:checked]:border-[#be185d] has-[:checked]:bg-[#be185d]/10">
                        <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="size-4 accent-[#be185d]" />
                        {METHOD_LABEL[m]}
                      </label>
                    ))}
                  </fieldset>
                  <button type="button" onClick={() => press('paid')} disabled={complete.isPending} className="h-14 rounded-2xl bg-[#be185d] text-[17px] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60">
                    {complete.isPending ? 'Processing…' : `Pay ${formatPeso(session.amountCentavos)}`}
                  </button>
                  <button type="button" onClick={() => press('failed')} disabled={complete.isPending} className="h-12 rounded-xl border bg-card text-sm font-bold hover:bg-surface-2 disabled:opacity-60">
                    Fail this payment (demo)
                  </button>
                </>
              ) : (
                <div className="rounded-2xl border border-[#f59e0b]/60 bg-[#f59e0b]/10 p-4 text-sm">
                  <p className="font-bold">This payment can no longer be made.</p>
                  <p className="text-muted-foreground">The ticket is {session.ticketStatus.replace('_', ' ')}.</p>
                  <Link to={session.returnPath} className="mt-3 inline-flex h-11 items-center rounded-xl border bg-card px-4 text-sm font-bold hover:bg-surface-2">
                    Back to the ticket
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
