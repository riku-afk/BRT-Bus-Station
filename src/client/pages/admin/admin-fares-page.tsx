import { useState, type FormEvent } from 'react';
import { ArrowLeftRight, Plus, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageTitle } from '@/components/layout/page-title';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import {
  useFareOverrides,
  useFareSettings,
  useRemoveFareOverride,
  useSaveFareSettings,
  useSetFareOverride,
  type FareSettings,
} from '@/features/fares/use-fare-admin';
import { useStations } from '@/features/stations/use-stations';
import { formatPeso, pesosToCentavos } from '@shared/money';

const PINK = '#be185d';
const toPesos = (centavos: number) => (centavos / 100).toFixed(2);
const fieldClass = 'h-[46px] rounded-xl px-3 text-sm font-semibold focus-visible:ring-[#be185d]';
const tint = (color: string, fill = 11) => `color-mix(in srgb, ${color} ${fill}%, var(--surface))`;

/** The fare for 1, 5 and 10 stations, and for the whole line: what riders will pay, as the rule is typed. */
function Preview({ baseC, perC, stationCount }: { baseC: number | null; perC: number | null; stationCount: number }) {
  const whole = Math.max(stationCount - 1, 1);
  const tiles = [
    { label: '1 station', n: 1, color: '#0f766e' },
    { label: '5 stations', n: 5, color: '#2563eb' },
    { label: '10 stations', n: 10, color: '#c2410c' },
    { label: `End to end (${whole} stations)`, n: whole, color: PINK },
  ].filter((t, i) => i === 3 || t.n < whole);
  return (
    <div className="grid grid-cols-2 gap-3" aria-live="polite">
      {tiles.map((t) => (
        <div key={t.label} className="flex flex-col gap-1 rounded-2xl p-4" style={{ background: tint(t.color, 12) }}>
          <span className="text-xs font-bold text-muted-foreground">{t.label}</span>
          <span className="text-[26px] font-extrabold" style={{ color: `color-mix(in srgb, ${t.color} 80%, var(--text))` }}>
            {baseC !== null && perC !== null ? formatPeso(baseC + perC * t.n) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

function FareRulePanel({ settings, stationCount }: { settings: FareSettings; stationCount: number }) {
  const save = useSaveFareSettings();
  // Initial values come straight from the saved rule; the component is only mounted once it has loaded.
  const [base, setBase] = useState(toPesos(settings.baseFareCentavos));
  const [perStation, setPerStation] = useState(toPesos(settings.perStationCentavos));

  function submit(e: FormEvent) {
    e.preventDefault();
    const baseFareCentavos = pesosToCentavos(base);
    const perStationCentavos = pesosToCentavos(perStation);
    if (baseFareCentavos === null || perStationCentavos === null) return toast.error('Enter amounts like 15 or 15.50');
    save.mutate({ baseFareCentavos, perStationCentavos }, { onSuccess: () => toast.success('Fare rule saved — applies to new tickets'), onError: (err) => toast.error(errorMessage(err)) });
  }

  const baseC = pesosToCentavos(base);
  const perC = pesosToCentavos(perStation);

  return (
    <>
      <form onSubmit={submit} className="relative flex min-w-0 flex-[1.3_1_440px] flex-col gap-5 overflow-hidden rounded-[22px] bg-[#9d174d] p-5 text-white sm:p-[26px]">
        <Tag aria-hidden strokeWidth={1.2} className="pointer-events-none absolute -bottom-10 -right-9 size-[200px] opacity-[0.12]" />
        <div className="relative flex flex-col gap-2.5">
          <h2 className="text-[22px] font-extrabold">Fare rule</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <span className="rounded-full bg-white/15 px-3 py-1.5">Fare</span>
            <span>=</span>
            <span className="rounded-full bg-[#facc15] px-3 py-1.5 text-[#1c1203]">base</span>
            <span>+</span>
            <span className="rounded-full bg-white px-3 py-1.5 text-[#9d174d]">per-station rate</span>
            <span>×</span>
            <span className="rounded-full bg-white/15 px-3 py-1.5">stations travelled</span>
          </div>
        </div>
        <div className="relative flex flex-wrap items-end gap-3">
          {[
            { id: 'base', label: 'Base fare (₱)', value: base, set: setBase },
            { id: 'per', label: 'Per station (₱)', value: perStation, set: setPerStation },
          ].map((f) => (
            <div key={f.id} className="flex min-w-[150px] flex-1 flex-col gap-1.5">
              <label htmlFor={f.id} className="text-[13px] font-bold">
                {f.label}
              </label>
              <span className="relative block">
                <span aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-extrabold text-[#9d174d]">
                  ₱
                </span>
                <Input
                  id={f.id}
                  inputMode="decimal"
                  required
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  className="h-[52px] rounded-xl border-0 bg-white pl-[34px] pr-3.5 text-xl font-extrabold text-[#500724] focus-visible:ring-[3px] focus-visible:ring-[#facc15] focus-visible:ring-offset-0"
                />
              </span>
            </div>
          ))}
          <button type="submit" disabled={save.isPending} className="h-[52px] rounded-xl bg-[#facc15] px-[22px] text-[15px] font-extrabold text-[#1c1203] transition-colors hover:bg-[#fde047] disabled:opacity-60">
            {save.isPending ? 'Saving…' : 'Save rule'}
          </button>
        </div>
      </form>

      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-[22px] border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-extrabold">What riders will pay</h2>
          <span className="text-[13px] text-muted-foreground">Updates as you type.</span>
        </div>
        <Preview baseC={baseC} perC={perC} stationCount={stationCount} />
      </div>
    </>
  );
}

/** Admin: the fare rule and fixed fares for specific station pairs (FARE-01, FARE-02). New tickets only (FARE-04). */
export function AdminFaresPage() {
  const settings = useFareSettings();
  const overrides = useFareOverrides();
  const { data: stations } = useStations();
  const setOverride = useSetFareOverride();
  const removeOverride = useRemoveFareOverride();

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [fixedFare, setFixedFare] = useState('');

  const fail = (e: unknown) => toast.error(errorMessage(e));

  function saveOverride(e: FormEvent) {
    e.preventDefault();
    const fareCentavos = pesosToCentavos(fixedFare);
    if (fareCentavos === null) return toast.error('Enter an amount like 40 or 40.50');
    setOverride.mutate(
      { originId: origin, destinationId: destination, fareCentavos },
      {
        onSuccess: () => {
          toast.success('Fixed fare saved');
          setOrigin('');
          setDestination('');
          setFixedFare('');
        },
        onError: fail,
      },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 md:px-8 md:pt-7">
      <PageTitle icon={Tag} color={PINK} title="Fares" description="Changes apply to tickets bought afterwards; existing tickets keep their fare." />

      <section className="flex flex-wrap items-stretch gap-4" aria-label="Fare rule">
        {settings.isLoading && <Skeleton className="h-48 w-full rounded-[22px]" />}
        {settings.error && <p className="text-sm text-destructive">{settings.error.message}</p>}
        {settings.data && <FareRulePanel settings={settings.data} stationCount={stations?.length ?? 0} />}
      </section>

      <section className="flex flex-col gap-[18px] rounded-[22px] border bg-card p-5 sm:p-6" aria-label="Fixed fares">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-extrabold">Fixed fares for specific pairs</h2>
          <span className="text-[13px] text-muted-foreground">A fixed fare replaces the rule for that pair, in both directions.</span>
        </div>
        <form onSubmit={saveOverride} className="flex flex-wrap items-end gap-3 rounded-2xl p-4" style={{ background: tint(PINK, 7) }}>
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <label htmlFor="ov-origin" className="text-[13px] font-bold">
              From
            </label>
            <NativeSelect id="ov-origin" required value={origin} onChange={(e) => setOrigin(e.target.value)} className={fieldClass}>
              <option value="">Choose…</option>
              {stations?.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === destination}>
                  {s.sequence}. {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <label htmlFor="ov-dest" className="text-[13px] font-bold">
              To
            </label>
            <NativeSelect id="ov-dest" required value={destination} onChange={(e) => setDestination(e.target.value)} className={fieldClass}>
              <option value="">Choose…</option>
              {stations?.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === origin}>
                  {s.sequence}. {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex w-36 flex-col gap-1.5">
            <label htmlFor="ov-fare" className="text-[13px] font-bold">
              Fare (₱)
            </label>
            <Input id="ov-fare" inputMode="decimal" required placeholder="0.00" value={fixedFare} onChange={(e) => setFixedFare(e.target.value)} className={fieldClass} />
          </div>
          <button type="submit" disabled={setOverride.isPending} className="flex h-[46px] items-center gap-2 rounded-xl bg-[#be185d] px-5 text-sm font-extrabold text-white transition hover:brightness-110 disabled:opacity-60">
            <Plus className="size-4" strokeWidth={2.6} aria-hidden /> Save fixed fare
          </button>
        </form>

        {overrides.isLoading && <Skeleton className="h-12 w-full rounded-2xl" />}
        {overrides.data?.length === 0 && (
          <div className="flex flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-7 text-center">
            <span className="grid size-[52px] place-items-center rounded-2xl text-[#be185d]" style={{ background: tint(PINK, 12) }}>
              <ArrowLeftRight className="size-6" aria-hidden />
            </span>
            <span className="text-[15px] font-extrabold">No fixed fares yet</span>
            <span className="text-[13px] text-muted-foreground">Every pair uses the rule above.</span>
          </div>
        )}
        {overrides.data && overrides.data.length > 0 && (
          <div className="flex flex-col gap-2">
            {overrides.data.map((o) => (
              <div key={`${o.originId}-${o.destinationId}`} className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5">
                <span className="flex flex-1 flex-wrap items-center gap-2 text-sm font-bold">
                  <span className="rounded-full px-2.5 py-1" style={{ background: tint('#0f766e', 12) }}>
                    {o.originName}
                  </span>
                  <ArrowLeftRight className="size-4 text-muted-foreground" role="img" aria-label="both directions" />
                  <span className="rounded-full px-2.5 py-1" style={{ background: tint('#0f766e', 12) }}>
                    {o.destinationName}
                  </span>
                </span>
                <strong className="text-[17px] font-extrabold text-[#be185d] dark:text-[#f472b6]">{formatPeso(o.fareCentavos)}</strong>
                <button
                  type="button"
                  aria-label={`Remove fixed fare ${o.originName} to ${o.destinationName}`}
                  onClick={() => removeOverride.mutate({ originId: o.originId, destinationId: o.destinationId }, { onSuccess: () => toast.success('Fixed fare removed'), onError: fail })}
                  className="grid size-10 place-items-center rounded-[10px] text-muted-foreground hover:bg-[#ffe4e6] hover:text-[#be123c] dark:hover:bg-[#be123c]/20"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
