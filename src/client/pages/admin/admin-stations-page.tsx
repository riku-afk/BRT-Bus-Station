import { useConfirm } from '@/components/confirm-dialog';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, MapPin, MapPinPlus, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { StationMap } from '@/components/map/station-map';
import { PageTitle } from '@/components/layout/page-title';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/features/auth/use-auth';
import {
  useAllStations,
  useCreateStation,
  useDeleteStation,
  useReorderStations,
  useUpdateStation,
  type Station,
} from '@/features/stations/use-stations';
import { cn } from '@/lib/utils';

const TEAL = '#0f766e';

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

  const activeCount = stations?.filter((s) => s.isActive).length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 md:px-8 md:pt-7">
      {dialog}
      <PageTitle icon={MapPin} color={TEAL} title="Stations" description="Drag a marker to move a station. Greyed markers are deactivated.">
        <span className="rounded-full bg-[#0f766e] px-3.5 py-2 text-[13px] font-bold text-white">{stations?.length ?? 0} stations</span>
        <span className="rounded-full px-3.5 py-2 text-[13px] font-bold" style={{ background: 'color-mix(in srgb, #16a34a 14%, var(--surface))' }}>
          {activeCount} active
        </span>
      </PageTitle>

      <section className="flex flex-wrap items-start gap-5">
        <div aria-label="Station map" className="flex min-w-0 flex-[3_1_520px] flex-col gap-3">
          <div className="rounded-[20px] border bg-card p-2.5">
            {isLoading && <Skeleton className="h-[60vh] w-full rounded-[14px]" />}
            {error && <p className="p-3 text-sm text-destructive">Could not load stations: {error.message}</p>}
            {stations && <StationMap stations={stations} editable={editable} draftPoint={draft} className="h-[65vh] min-h-[420px] overflow-hidden rounded-[14px]" />}
          </div>
        </div>

        <div className="flex min-w-0 flex-[2_1_380px] flex-col gap-4">
          <div className="relative flex flex-col gap-3.5 overflow-hidden rounded-[20px] bg-[#0f766e] p-[22px] text-white">
            <MapPin aria-hidden strokeWidth={1.4} className="pointer-events-none absolute -right-6 -top-5 size-[140px] opacity-15" />
            <div className="relative flex flex-col gap-1.5">
              <h2 className="text-xl font-extrabold">Add a station</h2>
              <p className="text-[13px] leading-relaxed text-[#ccfbf1]">New stations are added at the end of the line; use the arrows to reposition.</p>
            </div>
            {!placing ? (
              <button
                type="button"
                onClick={() => setPlacing(true)}
                className="relative flex h-[46px] items-center justify-center gap-2 rounded-xl bg-white text-sm font-extrabold text-[#0f766e] transition-colors hover:bg-[#ccfbf1]"
              >
                <MapPinPlus className="size-[18px]" aria-hidden /> Place on map
              </button>
            ) : (
              <div className="relative flex flex-col gap-3">
                <p className="text-sm font-semibold">{draft ? `Selected ${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)} (click again to adjust)` : 'Click the map where the station should go.'}</p>
                <Input placeholder="Station name" aria-label="Station name" value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={120} className="border-white/0 bg-white text-[#0f172a] placeholder:text-slate-500" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={!draft || !draftName.trim() || create.isPending}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#facc15] text-sm font-extrabold text-[#1c1203] transition-colors hover:bg-[#fde047] disabled:opacity-50"
                  >
                    <Plus className="size-4" aria-hidden /> Save station
                  </button>
                  <button type="button" onClick={cancelPlacing} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-bold hover:bg-white/25">
                    <X className="size-4" aria-hidden /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-[20px] border bg-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-extrabold">Stations ({stations?.length ?? 0})</h2>
              <span className="text-[13px] text-muted-foreground">In line order</span>
            </div>
            <div className="flex max-h-[560px] flex-col gap-1.5 overflow-y-auto pr-1">
              {stations?.map((s, i) => (
                <div key={s.id} className={cn('flex items-center gap-1.5 rounded-[14px] border p-1.5', s.isActive ? 'bg-card' : 'bg-surface-2 opacity-75')}>
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-[10px] text-[13px] font-extrabold text-white', s.isActive ? 'bg-[#0f766e]' : 'bg-[#94a3b8]')}>{s.sequence}</span>
                  <Input
                    aria-label={`Name of station ${s.sequence}`}
                    defaultValue={s.name}
                    key={`${s.id}-${s.name}`}
                    className="h-[42px] min-w-0 rounded-[10px] px-3 text-sm font-semibold focus-visible:ring-[#0f766e]"
                    onBlur={(e) => rename(s, e.target.value)}
                  />
                  <label className="flex h-10 shrink-0 cursor-pointer items-center px-1" title="Active">
                    <Switch color={TEAL} aria-label={`Station ${s.sequence} active`} checked={s.isActive} onChange={(e) => update.mutate({ id: s.id, isActive: e.target.checked }, { onError: fail })} />
                  </label>
                  <button type="button" aria-label="Move up" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} className="grid size-10 shrink-0 place-items-center rounded-[10px] text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent">
                    <ArrowUp className="size-4" />
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === stations.length - 1 || reorder.isPending} onClick={() => move(i, 1)} className="grid size-10 shrink-0 place-items-center rounded-[10px] text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent">
                    <ArrowDown className="size-4" />
                  </button>
                  <button type="button" aria-label={`Delete ${s.name}`} onClick={() => confirmDelete(s)} className="grid size-10 shrink-0 place-items-center rounded-[10px] text-muted-foreground hover:bg-[#ffe4e6] hover:text-[#be123c] dark:hover:bg-[#be123c]/20">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
