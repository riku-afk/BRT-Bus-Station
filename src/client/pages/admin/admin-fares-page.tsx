import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const toPesos = (centavos: number) => (centavos / 100).toFixed(2);

function FareRuleForm({ settings, stationCount }: { settings: FareSettings; stationCount: number }) {
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
  const endToEnd = stationCount > 1 && baseC !== null && perC !== null ? baseC + perC * (stationCount - 1) : null;

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="base">Base fare (₱)</Label>
        <Input id="base" inputMode="decimal" required value={base} onChange={(e) => setBase(e.target.value)} className="w-32" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="per">Per station (₱)</Label>
        <Input id="per" inputMode="decimal" required value={perStation} onChange={(e) => setPerStation(e.target.value)} className="w-32" />
      </div>
      <Button type="submit" disabled={save.isPending}>Save rule</Button>
      {endToEnd !== null && (
        <p className="text-sm text-muted-foreground">End to end ({stationCount - 1} stations): {formatPeso(endToEnd)}</p>
      )}
    </form>
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
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Fare rule</CardTitle>
          <CardDescription>Fare = base + per-station rate × stations travelled. Changes apply to tickets bought afterwards; existing tickets keep their fare.</CardDescription>
        </CardHeader>
        <CardContent>
          {settings.isLoading && <Skeleton className="h-16 w-full" />}
          {settings.error && <p className="text-sm text-destructive">{settings.error.message}</p>}
          {settings.data && <FareRuleForm settings={settings.data} stationCount={stations?.length ?? 0} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fixed fares for specific pairs</CardTitle>
          <CardDescription>A fixed fare replaces the rule for that pair, in both directions.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={saveOverride} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ov-origin">From</Label>
              <NativeSelect id="ov-origin" required value={origin} onChange={(e) => setOrigin(e.target.value)} className="w-52">
                <option value="">Choose…</option>
                {stations?.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.id === destination}>{s.sequence}. {s.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ov-dest">To</Label>
              <NativeSelect id="ov-dest" required value={destination} onChange={(e) => setDestination(e.target.value)} className="w-52">
                <option value="">Choose…</option>
                {stations?.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.id === origin}>{s.sequence}. {s.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ov-fare">Fare (₱)</Label>
              <Input id="ov-fare" inputMode="decimal" required value={fixedFare} onChange={(e) => setFixedFare(e.target.value)} className="w-28" />
            </div>
            <Button type="submit" disabled={setOverride.isPending}>
              <Plus /> Save fixed fare
            </Button>
          </form>

          {overrides.isLoading && <Skeleton className="h-12 w-full" />}
          {overrides.data?.length === 0 && <p className="text-sm text-muted-foreground">No fixed fares. Every pair uses the rule above.</p>}
          <div className="flex flex-col gap-1">
            {overrides.data?.map((o) => (
              <div key={`${o.originId}-${o.destinationId}`} className="flex items-center justify-between rounded border px-3 py-1.5 text-sm">
                <span>
                  {o.originName} ↔ {o.destinationName}
                </span>
                <span className="flex items-center gap-2">
                  <strong>{formatPeso(o.fareCentavos)}</strong>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove fixed fare ${o.originName} to ${o.destinationName}`}
                    onClick={() => removeOverride.mutate({ originId: o.originId, destinationId: o.destinationId }, { onSuccess: () => toast.success('Fixed fare removed'), onError: fail })}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
