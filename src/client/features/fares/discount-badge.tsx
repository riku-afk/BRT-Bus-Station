import { BadgePercent } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DISCOUNT_LABEL, DISCOUNT_PERCENT, type DiscountType } from '@shared/fares/discount';
import { formatPeso } from '@shared/money';

/** "Senior Citizen · 20% off": the kind of discount a ticket or account carries, as a small amber pill. */
export function DiscountBadge({ type, className }: { type: DiscountType; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full bg-[#fef3c7] px-2.5 py-1 text-[11px] font-extrabold text-[#92400e] dark:bg-[#d97706]/20 dark:text-[#fcd34d]', className)}
      data-testid="discount-badge"
    >
      <BadgePercent className="size-3.5" aria-hidden /> {DISCOUNT_LABEL[type]} · {DISCOUNT_PERCENT}% off
    </span>
  );
}

/** The sentence that explains what was taken off: only one passenger of a group gets it (the ID holder). */
export function DiscountNote({ type, discountCentavos, quantity }: { type: DiscountType; discountCentavos: number; quantity: number }) {
  return (
    <span className="text-xs font-semibold text-[#92400e] dark:text-[#fcd34d]" data-testid="discount-note">
      Includes the {DISCOUNT_LABEL[type]} discount ({DISCOUNT_PERCENT}% off, −{formatPeso(discountCentavos)}){quantity > 1 ? ' for the ID holder only' : ''}
    </span>
  );
}
