import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';

/** The focus ring colour of a page: indigo on sign in, pink on register. */
const FOCUS = {
  indigo: 'focus:border-[#4f46e5] focus:shadow-[0_0_0_4px_rgba(79,70,229,.18)]',
  pink: 'focus:border-[#be185d] focus:shadow-[0_0_0_4px_rgba(190,24,93,.16)]',
} as const;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  id: string;
  label: string;
  icon: LucideIcon;
  tone: keyof typeof FOCUS;
  /** A password field gets the show / hide button. */
  reveal?: boolean;
};

/** A labelled form field with a leading icon: 54px tall on a phone, 52px on a wide screen. */
export function AuthField({ id, label, icon: Icon, tone, reveal, type = 'text', ...input }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-[13px] font-extrabold">
        {label}
      </Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-[15px] top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id={id}
          type={reveal && shown ? 'text' : type}
          className={`h-[54px] w-full rounded-[14px] border-[1.5px] border-border bg-card pl-[46px] text-base font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground/70 min-[960px]:h-[52px] min-[960px]:text-[15px] ${reveal ? 'pr-[52px]' : 'pr-3.5'} ${FOCUS[tone]}`}
          {...input}
        />
        {reveal && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
            className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-surface-2"
          >
            {shown ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
          </button>
        )}
      </div>
    </div>
  );
}
