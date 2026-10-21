import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useSystemInfo } from '@/features/system/use-system';
import { BandArt, BrtIcon, PanelArt } from './auth-art';
import { ThemeToggle } from './theme-toggle';

export type AuthVariant = 'signin' | 'register';

const STEPS = [
  ['See where buses are waiting, live.', '#0369a1'],
  ['Buy for yourself or your group, pay by QR Ph.', '#be185d'],
  ['Board by showing your ticket’s QR code.', '#15803d'],
] as const;

/**
 * The frame of the sign-in and register pages. A wide screen is split: an illustrated brand panel on the left, the form card on a
 * dotted background on the right. A phone gets a header band with the headline and the form as a sheet over its lower edge.
 * It owns the whole screen, so the guest top bar is not shown on these pages.
 */
export function AuthCard({ variant, children }: { variant: AuthVariant; children: React.ReactNode }) {
  const { data } = useSystemInfo();
  const signin = variant === 'signin';
  const headline = signin ? (
    <>
      Ride the line.
      <br />
      <span className="text-[#facc15]">Tap. Pay. Board.</span>
    </>
  ) : (
    <>
      Your tickets,
      <br />
      <span className="text-[#facc15]">all in one place.</span>
    </>
  );

  return (
    <div className={`flex min-h-svh flex-col bg-[#0f172a] text-foreground min-[960px]:flex-row min-[960px]:bg-background`}>
      {/* Wide screens: the brand panel. Always dark, in both themes. */}
      <section
        aria-label="About Cavite Smart Transport Terminal"
        className={`relative hidden flex-none flex-col justify-between overflow-hidden bg-[#0f172a] px-14 pb-11 pt-10 text-white min-[960px]:flex min-[960px]:w-[54%]`}
      >
        <PanelArt variant={variant} />
        <div className="relative flex items-center gap-3">
          <BrtIcon size={44} />
          <span className="text-lg font-extrabold leading-tight tracking-tight">Cavite Smart Transport Terminal</span>
        </div>
        <div className="relative flex max-w-[470px] flex-col gap-[18px]">
          <h2 className="text-[54px] font-extrabold leading-[1.02] tracking-[-0.03em]">{headline}</h2>
          {signin ? (
            <>
              <p className="text-[17px] leading-relaxed text-slate-300 background-white">Buy your ticket on a bus waiting at your shelter, pay by QR Ph, and board with a QR code.</p>
              {/* <ul className="flex flex-wrap gap-2">
                {CHIPS.map(([label, color]) => (
                  <li key={label} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-[13px] font-bold">
                    <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
                    {label}
                  </li>
                ))}
              </ul> */}
            </>
          ) : (
            <ol className="flex flex-col gap-3">
              {STEPS.map(([text, color], i) => (
                <li key={text} className="flex items-center gap-3 text-[15px] text-slate-200">
                  <span className="grid size-[30px] flex-none place-items-center rounded-full text-[13px] font-extrabold" style={{ background: color }} aria-hidden>
                    {i + 1}
                  </span>
                  {text}
                </li>
              ))}
            </ol>
          )}
        </div>
        <span className="relative text-[13px] text-slate-400">
          {signin ? `${data?.versionLabel ? `${data.versionLabel}` : ''}` : ''}
        </span>
      </section>

      {/* Phones: the header band. */}
      <header className={`relative flex flex-none flex-col gap-[18px] overflow-hidden px-5 pt-5 text-white ${signin ? 'h-[330px] gap-[22px]' : 'h-[250px]'} min-[960px]:hidden`}>
        <BandArt variant={variant} />
        <div className="relative flex items-center justify-between">
          {signin ? (
            <span className="flex items-center gap-2.5">
              <BrtIcon size={38} />
              <span className="text-base font-extrabold leading-tight">Cavite Smart Transport Terminal</span>
            </span>
          ) : (
            <Link to="/login" aria-label="Back to sign in" className="grid size-11 place-items-center rounded-xl bg-white/15 text-white">
              <ChevronLeft className="size-[18px]" strokeWidth={2.4} aria-hidden />
            </Link>
          )}
          <ThemeToggle className="border-0 bg-white/15 text-white hover:bg-white/25" />
        </div>
        <p className={`relative font-extrabold leading-[1.05] tracking-[-0.03em] ${signin ? 'text-4xl' : 'text-[32px]'}`} aria-hidden>
          {headline}
        </p>
      </header>

      <section className={`relative flex flex-1 flex-col min-[960px]:auth-dots`}>
        <div className={`hidden justify-end px-6 py-5 min-[960px]:flex`}>
          <ThemeToggle />
        </div>
        <div className={`flex flex-1 flex-col min-[960px]:items-center min-[960px]:justify-center min-[960px]:px-6 min-[960px]:pb-14 min-[960px]:pt-2`}>
          <div
            className={`-mt-[26px] flex w-full flex-1 flex-col rounded-t-[28px] bg-background px-5 pb-8 pt-6 min-[960px]:mt-0 min-[960px]:max-w-[420px] min-[960px]:flex-none min-[960px]:rounded-[26px] min-[960px]:border min-[960px]:bg-card min-[960px]:px-8 min-[960px]:py-[34px] min-[960px]:shadow-[0_30px_60px_-30px_rgba(15,23,42,.35)]`}
          >
            {children}
            {data?.versionLabel && <p className={`mt-6 text-center text-xs text-muted-foreground min-[960px]:hidden`}>{data.versionLabel}</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
