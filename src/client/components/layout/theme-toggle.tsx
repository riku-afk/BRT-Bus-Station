import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={cn('grid size-11 shrink-0 place-items-center rounded-xl border bg-card text-foreground transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', className)}
    >
      {isDark ? <Sun className="size-[18px] text-[#f59e0b]" aria-hidden /> : <Moon className="size-[18px] text-[#4f46e5]" aria-hidden />}
    </button>
  );
}
