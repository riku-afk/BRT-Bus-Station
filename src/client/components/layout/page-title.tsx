import type { LucideIcon } from 'lucide-react';

type Props = {
  icon: LucideIcon;
  /** The section's identity colour. */
  color: string;
  /** Text on that colour (amber needs dark ink). */
  ink?: string;
  title: string;
  description?: string;
  /** Count pills and the like, on the right. */
  children?: React.ReactNode;
};

/** The top of an admin page: a 52px icon tile in the section colour, the title, a one-line description, and optional pills on the right. */
export function PageTitle({ icon: Icon, color, ink = '#ffffff', title, description, children }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="grid size-[52px] shrink-0 place-items-center rounded-2xl" style={{ background: color, color: ink }}>
          <Icon className="size-[26px]" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[28px]">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

/** A small count pill for the right of a PageTitle. */
export function CountPill({ color, label, value }: { color: string; label: string; value: string | number }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-bold"
      style={{ background: `color-mix(in srgb, ${color} 12%, var(--surface))`, border: `1px solid color-mix(in srgb, ${color} 30%, var(--surface))` }}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="text-base font-extrabold">{value}</span>
    </span>
  );
}
