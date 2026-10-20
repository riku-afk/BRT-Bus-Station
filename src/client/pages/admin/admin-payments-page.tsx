import { useState } from 'react';
import { AlertTriangle, CreditCard } from 'lucide-react';
import { PageTitle } from '@/components/layout/page-title';
import { Pagination } from '@/components/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { reviewReasonText, useAdminPayments, type AdminPayment } from '@/features/payments/use-admin-payments';
import { formatManilaDateTime } from '@shared/datetime/ph-time';
import { formatPeso } from '@shared/money';

const GREEN = '#15803d';
const STATUS_STYLE: Record<AdminPayment['status'], string> = {
  pending: 'bg-[#fef3c7] text-[#92400e] dark:bg-[#d97706]/20 dark:text-[#fcd34d]',
  succeeded: 'bg-[#dcfce7] text-[#166534] dark:bg-[#16a34a]/20 dark:text-[#86efac]',
  failed: 'bg-[#ffe4e6] text-[#9f1239] dark:bg-[#e11d48]/20 dark:text-[#fda4af]',
  cancelled: 'bg-surface-2 text-muted-foreground',
  needs_review: 'bg-[#be123c] text-white',
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
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 md:px-8 md:pt-7">
      <PageTitle
        icon={CreditCard}
        color={GREEN}
        title="Payments"
        description="A ticket becomes paid only from a verified payment notice. Money that could not be applied to its ticket is kept here for you to look at; there is no refund flow in this proof of concept."
      >
        <span className="rounded-full bg-[#15803d] px-3.5 py-2 text-[13px] font-bold text-white">{paged?.total ?? 0} {reviewOnly ? 'to review' : 'payments'}</span>
      </PageTitle>

      <section className="flex flex-col gap-3.5 rounded-[20px] border bg-card p-5 sm:p-6" aria-label="Payments">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">Payments</h2>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-bold">
            <Switch
              color={GREEN}
              checked={reviewOnly}
              onChange={(e) => {
                setReviewOnly(e.target.checked);
                setPageNo(1);
              }}
            />
            Needs review only
          </label>
        </div>
        {attention > 0 && !reviewOnly && (
          <p className="flex items-center gap-2 rounded-2xl border border-[#e11d48]/40 bg-[#e11d48]/10 p-3 text-sm font-bold text-[#be123c] dark:text-[#fb7185]">
            <AlertTriangle className="size-4" aria-hidden /> {attention} payment{attention === 1 ? '' : 's'} need{attention === 1 ? 's' : ''} review.
          </p>
        )}
        {isLoading && <Skeleton className="h-24 w-full rounded-2xl" />}
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        {payments?.length === 0 && <p className="rounded-2xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground">{reviewOnly ? 'Nothing needs review.' : 'No payments yet.'}</p>}
        <div className="flex flex-col gap-2">
          {payments?.map((p) => (
            <div key={p.id} className="grid items-center gap-x-4 gap-y-1.5 rounded-[14px] border p-3 text-sm hover:bg-surface-2 md:grid-cols-[9rem_1fr_6rem_6rem_7.5rem]">
              <span className="text-xs text-muted-foreground">{formatManilaDateTime(p.createdAt)}</span>
              <span className="min-w-0">
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-bold">{p.referenceCode}</span> · {p.originName} → {p.destinationName}
              </span>
              <span className="font-extrabold">{formatPeso(p.amountCentavos)}</span>
              <span className="text-xs font-bold text-muted-foreground">{p.method ? p.method.toUpperCase() : p.provider}</span>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
              {p.reviewReason && <p className="text-xs font-semibold text-[#be123c] dark:text-[#fb7185] md:col-span-5">{reviewReasonText(p.reviewReason)}</p>}
            </div>
          ))}
        </div>
        {paged && <Pagination page={paged} onPage={setPageNo} busy={isPlaceholderData} label="Payments pages" />}
      </section>
    </div>
  );
}
