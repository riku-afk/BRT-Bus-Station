import { Bus } from 'lucide-react';

/** The frame of the sign-in and register pages: the brand, a heading, and a white card for the form. Mobile first: it is one column. */
export function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="auth-surface flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center gap-5 px-4 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-[#facc15] text-[#0f172a] shadow-sm">
          <Bus className="size-7" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="w-full max-w-md rounded-[22px] border bg-card p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,.35)] sm:p-6">{children}</div>
    </div>
  );
}
