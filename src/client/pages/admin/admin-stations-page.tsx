import { useConfirm } from '@/components/confirm-dialog';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, MapPin, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { StationMap } from '@/components/map/station-map';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import {
  useAllStations,
  useCreateStation,
  useDeleteStation,
  useReorderStations,
  useUpdateStation,
  type Station,
} from '@/features/stations/use-stations';

/** Admin: place, rename, reorder, deactivate and delete stations (STN-03, STN-05). */
export function AdminStationsPage() {
  const { data: stations, isLoading, error } = useAllStations();
  const create = useCreateStation();
  const update = useUpdateStation();
  const remove = useDeleteStation();
  const { ask, dialog } = useConfirm();
  const reorder = useReorderStations();

  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState<{ latitude: number; longitude: number } | null>(null);
  const [draftName, setDraftName] = useState('');

  const fail = (e: unknown) => toast.error(errorMessage(e));

  const editable = useMemo(
    () => ({
      onStationMove: (id: string, latitude: number, longitude: number) =>
        update.mutate({ id, latitude, longitude }, { onSuccess: () => toast.success('Station moved'), onError: fail }),
      onMapClick: (latitude: number, longitude: number) => {
        if (placing) setDraft({ latitude, longitude });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placing, update.mutate],
  );

  function cancelPlacing() {
    setPlacing(false);
    setDraft(null);
    setDraftName('');
  }

  function saveDraft() {
    if (!draft || !draftName.trim()) return;
    create.mutate(
      { name: draftName.trim(), ...draft },
      {
        onSuccess: () => {
          toast.success('Station added at the end of the line');
          cancelPlacing();
        },
        onError: fail,
      },
    );
  }

  function move(index: number, delta: -1 | 1) {
    if (!stations) return;
    const ids = stations.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids, { onError: fail });
  }

  function rename(station: Station, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === station.name) return;
    update.mutate({ id: station.id, name: trimmed }, { onError: fail });
  }

  async function confirmDelete(station: Station) {
    if (!(await ask({ title: `Delete ${station.name}?`, description: "Stations after it move up one position.", confirmLabel: "Delete", destructive: true }))) return;
    remove.mutate(station.id, { onSuccess: () => toast.success('Station deleted'), onError: fail });
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 xl:grid-cols-[1fr_30rem]">
      {dialog}
      <section aria-label="Station map" className="flex flex-col gap-2">
        {isLoading && <Skeleton className="h-[60vh] w-full" />}
        {error && <p className="text-sm text-destructive">Could not load stations: {error.message}</p>}
        {stations && <StationMap stations={stations} editable={editable} draftPoint={draft} className="h-[65vh]" />}
        <p className="text-xs text-muted-foreground">Drag a marker to move a station. Greyed markers are deactivated.</p>
      </section>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Add a station</CardTitle>
            <CardDescription>New stations are added at the end of the line; use the arrows to reposition.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!placing ? (
              <Button onClick={() => setPlacing(true)}>
                <MapPin /> Place on map
              </Button>
            ) : (
              <>
                <p className="text-sm">{draft ? `Selected ${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)} (click again to adjust)` : 'Click the map where the station should go.'}</p>
                <Input placeholder="Station name" aria-label="Station name" value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={120} />
                <div className="flex gap-2">
                  <Button onClick={saveDraft} disabled={!draft || !draftName.trim() || create.isPending}>
                    <Plus /> Save station
                  </Button>
                  <Button variant="ghost" onClick={cancelPlacing}>
                    <X /> Cancel
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stations ({stations?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto">
            {stations?.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 rounded border px-2 py-1">
                <span className="w-6 text-right text-xs text-muted-foreground">{s.sequence}</span>
                <Input
                  aria-label={`Name of station ${s.sequence}`}
                  defaultValue={s.name}
                  key={`${s.id}-${s.name}`}
                  className="h-8"
                  onBlur={(e) => rename(s, e.target.value)}
                />
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={s.isActive} onChange={(e) => update.mutate({ id: s.id, isActive: e.target.checked }, { onError: fail })} />
                  Active
                </label>
                <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === stations.length - 1 || reorder.isPending} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => confirmDelete(s)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
