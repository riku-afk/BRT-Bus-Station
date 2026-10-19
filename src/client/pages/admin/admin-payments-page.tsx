import { useState } from 'react';
import { Pagination } from '@/components/pagination';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { reviewReasonText, useAdminPayments, type AdminPayment } from '@/features/payments/use-admin-payments';
import { cn } from '@/lib/utils';
import { formatManilaDateTime } from '@shared/datetime/ph-time';
import { formatPeso } from '@shared/money';

const STATUS_STYLE: Record<AdminPayment['status'], string> = {
  pending: 'bg-warning/20 text-warning',
  succeeded: 'bg-success/15 text-success',
  failed: 'bg-destructive/15 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
  needs_review: 'bg-destructive/20 text-destructive',
};
const STATUS_LABEL: Record<AdminPayment['status'], string> = {
  pending: 'Pending',
  succeeded: 'Paid',
  failed: 'Failed',
  cancelled: 'Closed',
  needs_review: 'Needs review',
};

/** Admin: recent payments, with the ones that could not be applied to a ticket called out (PAY-06, PAY-07). */
export function AdminPaymentsPage() {
  const [reviewOnly, setReviewOnly] = useState(false);
  const [pageNo, setPageNo] = useState(1);
  const { data: paged, isLoading, error, isPlaceholderData } = useAdminPayments(reviewOnly, pageNo);
  const payments = paged?.items;
  const attention = payments?.filter((p) => p.status === 'needs_review').length ?? 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Payments
            <label className="flex items-center gap-2 text-sm font-normal">
              <input type="checkbox" checked={reviewOnly} onChange={(e) => {
                  setReviewOnly(e.target.checked);
                  setPageNo(1);
                }} />
              Needs review only
            </label>
          </CardTitle>
          <CardDescription>
            A ticket becomes paid only from a verified payment notice. Money that could not be applied to its ticket is kept here for you to look at; there is no
            refund flow in this proof of concept.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {attention > 0 && !reviewOnly && (
            <p className="flex items-center gap-2 rounded-md border border-destructive/40 p-2 text-sm text-destructive">
              <AlertTriangle className="size-4" aria-hidden /> {attention} payment{attention === 1 ? '' : 's'} need{attention === 1 ? 's' : ''} review.
            </p>
          )}
          {isLoading && <Skeleton className="h-24 w-full" />}
          {error && <p className="text-sm text-destructive">{error.message}</p>}
          {payments?.length === 0 && <p className="text-sm text-muted-foreground">{reviewOnly ? 'Nothing needs review.' : 'No payments yet.'}</p>}
          {payments?.map((p) => (
            <div key={p.id} className="grid items-center gap-x-3 gap-y-1 rounded border p-2 text-sm md:grid-cols-[8rem_1fr_6rem_6rem_7rem]">
              <span className="text-xs text-muted-foreground">{formatManilaDateTime(p.createdAt)}</span>
              <span>
                <span className="font-mono text-xs">{p.referenceCode}</span> · {p.originName} → {p.destinationName}
              </span>
              <span className="font-medium">{formatPeso(p.amountCentavos)}</span>
              <span className="text-xs text-muted-foreground">{p.method ? p.method.toUpperCase() : p.provider}</span>
              <span className={cn('w-fit rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLE[p.status])}>{STATUS_LABEL[p.status]}</span>
              {p.reviewReason && <p className="text-xs text-destructive md:col-span-5">{reviewReasonText(p.reviewReason)}</p>}
            </div>
          ))}
          {paged && <Pagination page={paged} onPage={setPageNo} busy={isPlaceholderData} label="Payments pages" />}
        </CardContent>
      </Card>
    </div>
  );
}
