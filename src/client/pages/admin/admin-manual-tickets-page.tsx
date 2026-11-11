import { useState, type FormEvent } from 'react';
import { Download, Printer, QrCode, Ticket, TicketPlus } from 'lucide-react';
import { toast } from 'sonner';
import { PageTitle } from '@/components/layout/page-title';
import { Pagination } from '@/components/pagination';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { DiscountBadge } from '@/features/fares/discount-badge';
import { useFareQuote } from '@/features/fares/use-fare';
import { useStations } from '@/features/stations/use-stations';
import { manualQrUrl, useCreateManualTicket, useManualTickets, type ManualTicket } from '@/features/tickets/use-manual-tickets';
import { cn } from '@/lib/utils';
import { formatManilaDateTime } from '@shared/datetime/ph-time';
import { DISCOUNT_LABEL, DISCOUNT_PERCENT, DISCOUNT_TYPES, isDiscountType, priceTicket, type DiscountType } from '@shared/fares/discount';
import { formatPeso } from '@shared/money';
import { MAX_TICKET_QUANTITY, TICKET_STATUS_LABEL } from '@shared/tickets/status';

const CYAN = '#0e7490';
const tint = (color: string, fill = 12) => `color-mix(in srgb, ${color} ${fill}%, var(--surface))`;
const whiteField = 'h-[52px] rounded-xl border-0 bg-white px-3.5 text-[15px] font-semibold text-[#0c2d36] focus-visible:ring-[3px] focus-visible:ring-[#facc15] focus-visible:ring-offset-0';
const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-[#dcfce7] text-[#166534] dark:bg-[#16a34a]/20 dark:text-[#86efac]',
  used: 'bg-surface-2 text-muted-foreground',
  expired: 'bg-[#ffe4e6] text-[#9f1239] dark:bg-[#e11d48]/20 dark:text-[#fda4af]',
};

/** The ticket as the passenger receives it: reference, trip, how many, the total, and the QR code. This is also what is printed. */
function TicketSlip({ ticket }: { ticket: ManualTicket }) {
  const paid = ticket.status === 'paid';
  return (
    <div className="print-slip flex flex-col gap-4 rounded-2xl border p-4 sm:p-5" data-testid="ticket-slip">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cavite Smart Transport Terminal</span>
        <span className="text-[26px] font-extrabold tracking-tight" data-testid="slip-reference">
          {ticket.referenceCode}
        </span>
        <span className="text-[15px] font-extrabold">
          {ticket.originName} → {ticket.destinationName}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Passengers</dt>
          <dd className="font-extrabold">{ticket.quantity}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Total paid</dt>
          <dd className="font-extrabold">{formatPeso(ticket.fareCentavos)}</dd>
        </div>
        {ticket.passengerName && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Name</dt>
            <dd className="font-extrabold">{ticket.passengerName}</dd>
          </div>
        )}
        {ticket.discountType && (
          <div className="col-span-2" data-testid="slip-discount">
            <dt className="text-xs text-muted-foreground">
              {DISCOUNT_LABEL[ticket.discountType]} discount ({DISCOUNT_PERCENT}% off{ticket.quantity > 1 ? ', ID holder only' : ''})
            </dt>
            <dd className="font-extrabold">
              −{formatPeso(ticket.discountCentavos ?? 0)}
              {ticket.discountId ? <span className="ml-2 font-mono text-xs font-semibold">ID {ticket.discountId}</span> : null}
            </dd>
          </div>
        )}
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Valid until</dt>
          <dd className="font-bold">{formatManilaDateTime(ticket.validUntil)}</dd>
        </div>
      </dl>
      {paid ? (
        <div className="grid place-items-center rounded-2xl bg-white p-3">
          <img src={manualQrUrl(ticket.id)} alt={`QR code for ticket ${ticket.referenceCode}`} width={240} height={240} className="size-60" />
        </div>
      ) : (
        <p className="rounded-2xl border-2 border-dashed p-4 text-center text-sm text-muted-foreground">
          This ticket is {TICKET_STATUS_LABEL[ticket.status].toLowerCase()}, so it has no QR code any more.
        </p>
      )}
      <p className="text-xs text-muted-foreground">Show this QR code to the konduktor when boarding. One scan admits everyone on the ticket, at the shelter it starts from.</p>
    </div>
  );
}

function NewTicketForm({ onIssued }: { onIssued: (ticket: ManualTicket) => void }) {
  const { data: stations } = useStations();
  const create = useCreateManualTicket();
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState<DiscountType | ''>('');
  const [discountId, setDiscountId] = useState('');
  const quote = useFareQuote(origin || null, destination || null);
  const price = quote.data ? priceTicket(quote.data.fareCentavos, quantity, discount || null) : null;
  const total = price ? price.totalCentavos : null;
  const idMissing = Boolean(discount) && discountId.trim().length < 3;

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        originId: origin,
        destinationId: destination,
        quantity,
        ...(name.trim() ? { passengerName: name.trim() } : {}),
        ...(discount ? { discountType: discount, discountId: discountId.trim() } : {}),
      },
      {
        onSuccess: (ticket) => {
          toast.success(`Ticket ${ticket.referenceCode} issued`);
          onIssued(ticket);
          setName('');
          setQuantity(1);
          setDiscount('');
          setDiscountId('');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <form onSubmit={submit} className="relative flex min-w-0 flex-[1.2_1_420px] flex-col gap-5 overflow-hidden rounded-[22px] p-5 text-white sm:p-[26px]" style={{ background: CYAN }}>
      <TicketPlus aria-hidden strokeWidth={1.2} className="pointer-events-none absolute -bottom-10 -right-9 size-[200px] opacity-[0.12]" />
      <div className="relative flex flex-col gap-1.5">
        <h2 className="text-[22px] font-extrabold">New ticket</h2>
        <span className="text-sm font-medium text-white/85">The passenger pays you directly. The ticket is paid as soon as you issue it.</span>
      </div>

      <div className="relative flex flex-col gap-1.5">
        <label htmlFor="mt-name" className="text-[13px] font-bold">
          Passenger name <span className="font-medium text-white/75">(optional)</span>
        </label>
        <Input id="mt-name" maxLength={80} autoComplete="off" placeholder="Maria Santos" value={name} onChange={(e) => setName(e.target.value)} className={whiteField} />
      </div>

      <div className="relative flex flex-wrap gap-3">
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <label htmlFor="mt-origin" className="text-[13px] font-bold">
            From
          </label>
          <NativeSelect id="mt-origin" required value={origin} onChange={(e) => setOrigin(e.target.value)} className={whiteField}>
            <option value="">Choose…</option>
            {stations?.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === destination}>
                {s.sequence}. {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <label htmlFor="mt-dest" className="text-[13px] font-bold">
            To
          </label>
          <NativeSelect id="mt-dest" required value={destination} onChange={(e) => setDestination(e.target.value)} className={whiteField}>
            <option value="">Choose…</option>
            {stations?.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === origin}>
                {s.sequence}. {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="relative flex flex-wrap items-end gap-3">
        <div className="flex w-36 flex-col gap-1.5">
          <label htmlFor="mt-qty" className="text-[13px] font-bold">
            Passengers
          </label>
          <Input
            id="mt-qty"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_TICKET_QUANTITY}
            required
            value={quantity}
            onChange={(e) => setQuantity(Math.min(MAX_TICKET_QUANTITY, Math.max(1, Math.trunc(Number(e.target.value)) || 1)))}
            className={whiteField}
          />
        </div>
        <div className="flex min-w-[170px] flex-1 flex-col gap-0.5 rounded-xl bg-white/15 px-4 py-2.5" aria-live="polite" data-testid="fare-preview">
          <span className="text-xs font-bold text-white/85">
            {quote.data ? `${formatPeso(quote.data.fareCentavos)} each · ${quantity} passenger${quantity === 1 ? '' : 's'}` : 'Total to collect'}
            {price && price.discountCentavos > 0 ? ` · −${formatPeso(price.discountCentavos)} discount` : ''}
          </span>
          <span className="text-2xl font-extrabold">{total !== null ? formatPeso(total) : '—'}</span>
        </div>
      </div>

      <div className="relative flex flex-wrap gap-3" data-testid="discount-fields">
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <label htmlFor="mt-discount" className="text-[13px] font-bold">
            Discount <span className="font-medium text-white/75">({DISCOUNT_PERCENT}%, one passenger)</span>
          </label>
          <NativeSelect
            id="mt-discount"
            value={discount}
            onChange={(e) => {
              const v = e.target.value;
              setDiscount(isDiscountType(v) ? v : '');
              if (!isDiscountType(v)) setDiscountId('');
            }}
            className={whiteField}
          >
            <option value="">None</option>
            {DISCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DISCOUNT_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
        {discount && (
          <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
            <label htmlFor="mt-discount-id" className="text-[13px] font-bold">
              {DISCOUNT_LABEL[discount]} ID number
            </label>
            <Input id="mt-discount-id" required minLength={3} maxLength={50} autoComplete="off" placeholder="As printed on the ID" value={discountId} onChange={(e) => setDiscountId(e.target.value)} className={whiteField} />
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={create.isPending || !origin || !destination || origin === destination || idMissing}
        className="relative h-[52px] rounded-xl bg-[#facc15] px-[22px] text-[15px] font-extrabold text-[#1c1203] transition-colors hover:bg-[#fde047] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {create.isPending ? 'Issuing…' : 'Issue ticket'}
      </button>
    </form>
  );
}

/** Admin: sell a ticket over the counter and hand over the QR code, printed or saved as a picture. Under Fares. */
export function AdminManualTicketsPage() {
  const [pageNo, setPageNo] = useState(1);
  const { data: paged, isLoading, error, isPlaceholderData } = useManualTickets(pageNo);
  const [selected, setSelected] = useState<ManualTicket | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 md:px-8 md:pt-7">
      <PageTitle icon={TicketPlus} color={CYAN} title="Manual tickets" description="Sell a ticket over the counter. It is paid at once; give the passenger the QR code printed or saved." />

      <section className="flex flex-wrap items-start gap-4" aria-label="Issue a ticket">
        <NewTicketForm onIssued={setSelected} />

        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-[22px] border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-extrabold">Ticket</h2>
            <span className="text-[13px] text-muted-foreground">Download the QR code or print the ticket.</span>
          </div>
          {selected ? (
            <>
              <TicketSlip ticket={selected} />
              {selected.status === 'paid' && (
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <a
                    href={manualQrUrl(selected.id)}
                    download={`ticket-${selected.referenceCode}.png`}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-extrabold transition-colors hover:bg-surface-2"
                  >
                    <Download className="size-[18px]" aria-hidden /> Download QR
                  </a>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-extrabold text-white transition hover:brightness-110"
                    style={{ background: CYAN }}
                  >
                    <Printer className="size-[18px]" aria-hidden /> Print ticket
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-9 text-center">
              <span className="grid size-[52px] place-items-center rounded-2xl" style={{ background: tint(CYAN), color: CYAN }}>
                <QrCode className="size-6" aria-hidden />
              </span>
              <span className="text-[15px] font-extrabold">No ticket yet</span>
              <span className="text-[13px] text-muted-foreground">Issue a ticket and its QR code appears here.</span>
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-[18px] rounded-[22px] border bg-card p-5 sm:p-6" aria-label="Tickets sold over the counter">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-extrabold">Sold over the counter</h2>
          <span className="text-[13px] text-muted-foreground">Newest first. Choose “View” to show a ticket’s QR code again.</span>
        </div>

        {isLoading && <Skeleton className="h-16 w-full rounded-2xl" />}
        {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
        {paged?.items.length === 0 && (
          <div className="flex flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-7 text-center">
            <span className="grid size-[52px] place-items-center rounded-2xl" style={{ background: tint(CYAN), color: CYAN }}>
              <Ticket className="size-6" aria-hidden />
            </span>
            <span className="text-[15px] font-extrabold">Nothing sold yet</span>
            <span className="text-[13px] text-muted-foreground">Tickets you issue appear here.</span>
          </div>
        )}
        {paged && paged.items.length > 0 && (
          <div className="flex flex-col gap-2" data-testid="manual-list">
            {paged.items.map((t) => (
              <div key={t.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border px-3.5 py-3', selected?.id === t.id && 'border-[#0e7490] ring-1 ring-[#0e7490]')}>
                <div className="flex min-w-[170px] flex-1 flex-col gap-0.5">
                  <span className="text-sm font-extrabold">
                    {t.referenceCode} · {t.originName} → {t.destinationName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t.quantity} passenger{t.quantity === 1 ? '' : 's'}
                    {t.passengerName ? ` · ${t.passengerName}` : ''} · {formatManilaDateTime(t.createdAt)}
                    {t.encodedByName ? ` · by ${t.encodedByName}` : ''}
                  </span>
                </div>
                {t.discountType && <DiscountBadge type={t.discountType} />}
                <strong className="text-[15px] font-extrabold">{formatPeso(t.fareCentavos)}</strong>
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-extrabold', STATUS_STYLE[t.status] ?? 'bg-surface-2 text-muted-foreground')}>{TICKET_STATUS_LABEL[t.status]}</span>
                <button
                  type="button"
                  onClick={() => setSelected(t)}
                  aria-label={`View ticket ${t.referenceCode}`}
                  className="h-10 rounded-xl border px-4 text-sm font-bold transition-colors hover:bg-surface-2"
                >
                  View
                </button>
              </div>
            ))}
          </div>
        )}
        {paged && <Pagination page={paged} onPage={setPageNo} busy={isPlaceholderData} label="Manual tickets pages" />}
      </section>
    </div>
  );
}
