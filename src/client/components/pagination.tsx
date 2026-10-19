import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeRange, type Page } from '@shared/pagination';

type Props = {
  page: Pick<Page<unknown>, 'page' | 'pageSize' | 'total' | 'totalPages'> & { items: unknown[] };
  onPage: (page: number) => void;
  /** Disables the buttons while the next page loads. */
  busy?: boolean;
  label?: string;
};

/** "1 to 10 of 83" with Previous / Next. Renders nothing when everything fits on one page. */
export function Pagination({ page, onPage, busy, label = 'Pagination' }: Props) {
  if (page.total <= page.pageSize) {
    return page.total > 0 ? <p className="text-xs text-muted-foreground">{page.total} in total</p> : null;
  }
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Showing {describeRange(page.page, page.pageSize, page.total, page.items.length)}
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" disabled={busy || page.page <= 1} onClick={() => onPage(page.page - 1)} aria-label="Previous page">
          <ChevronLeft /> Previous
        </Button>
        <span className="px-1 text-xs font-medium tabular-nums">
          {page.page} / {page.totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={busy || page.page >= page.totalPages} onClick={() => onPage(page.page + 1)} aria-label="Next page">
          Next <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
