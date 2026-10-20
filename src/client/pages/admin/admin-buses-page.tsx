import { useConfirm } from '@/components/confirm-dialog';
import { useState, type FormEvent } from 'react';
import { Bus as BusIcon, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageTitle } from '@/components/layout/page-title';
import { Pagination } from '@/components/pagination';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import {
  BUS_STATUSES,
  useAssignKonduktor,
  useBuses,
  useCreateBus,
  useDeleteBus,
  useUpdateBus,
  type Bus,
  type BusStatus,
} from '@/features/buses/use-buses';
import { useKonduktorOptions } from '@/features/konduktors/use-konduktors';

const STATUS_LABEL: Record<BusStatus, string> = { active: 'Active', inactive: 'Inactive', maintenance: 'Maintenance' };
const ORANGE = '#c2410c';
const CARD_COLORS = ['#c2410c', '#be185d', '#7c3aed', '#2563eb', '#0f766e', '#15803d', '#4f46e5'];
const fieldClass = 'h-11 rounded-xl px-3 text-sm font-semibold focus-visible:ring-[#c2410c]';

/** "Bus 5" shows as 5; any other name shows its first letter. */
const busNumber = (name: string) => name.match(/\d+/)?.[0] ?? name.charAt(0).toUpperCase();

function Mode({ bus }: { bus: Bus }) {
  const out = bus.status !== 'active';
  const text = out ? (bus.status === 'maintenance' ? 'In maintenance' : 'Out of service') : bus.konduktor ? 'Konduktor dispatches · sells tickets' : 'Runs automatically';
  const style = out ? { background: 'var(--surface-2)', color: '#64748b' } : bus.konduktor ? { background: '#dcfce7', color: '#166534' } : { background: '#dbeafe', color: '#1e40af' };
  return (
    <span className="inline-flex items-center gap-1.5 justify-self-start rounded-full px-3 py-[5px] text-xs font-bold [grid-column:1/-1]" style={style}>
      {text}
    </span>
  );
}

/** Admin: manage buses and assign konduktors (BUS-02, BUS-03). */
export function AdminBusesPage() {
  const [pageNo, setPageNo] = useState(1);
  const { data: paged, isLoading, error, isPlaceholderData } = useBuses(pageNo);
  const buses = paged?.items;
  const { data: konduktors } = useKonduktorOptions();
  const create = useCreateBus();
  const update = useUpdateBus();
  const remove = useDeleteBus();
  const { ask, dialog } = useConfirm();
  const assign = useAssignKonduktor();

  const [plateNumber, setPlateNumber] = useState('');
  const [name, setName] = useState('');

  const fail = (e: unknown) => toast.error(errorMessage(e));

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { plateNumber, name },
      {
        onSuccess: () => {
          toast.success('Bus added');
          setPlateNumber('');
          setName('');
        },
        onError: fail,
      },
    );
  }

  function editText(bus: Bus, field: 'name' | 'plateNumber', value: string) {
    const trimmed = value.trim();
    if (!trimmed || trimmed === bus[field]) return;
    update.mutate({ id: bus.id, [field]: trimmed }, { onError: fail });
  }

  async function confirmDelete(bus: Bus) {
    if (!(await ask({ title: `Delete ${bus.name}?`, description: `${bus.plateNumber} will be removed from the fleet.`, confirmLabel: `Delete`, destructive: true }))) return;
    remove.mutate(bus.id, { onSuccess: () => toast.success('Bus deleted'), onError: fail });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 md:px-8 md:pt-7">
      {dialog}
      <PageTitle icon={BusIcon} color={ORANGE} title="Buses" description="Your fleet, its plate numbers and who runs each bus.">
        <span className="rounded-full bg-[#c2410c] px-3.5 py-2 text-[13px] font-bold text-white">{paged?.total ?? 0} buses</span>
      </PageTitle>

      <section className="flex flex-wrap items-stretch gap-4">
        <div className="relative flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 overflow-hidden rounded-[20px] bg-[#c2410c] p-6 text-white">
          <BusIcon aria-hidden strokeWidth={1.4} className="pointer-events-none absolute -bottom-7 -right-6 size-[150px] opacity-[0.16]" />
          <h2 className="relative text-xl font-extrabold">How buses run</h2>
          <ul className="relative flex flex-col gap-2.5 text-[13px] leading-relaxed">
            {[
              'A bus with a konduktor waits at a station until that konduktor dispatches it.',
              'A bus without one runs the line automatically.',
              'Passengers buy tickets on a bus waiting at a shelter, so only buses with a konduktor sell tickets.',
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <span className="mt-[7px] size-2 shrink-0 rounded-full bg-[#fde68a]" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={submit} className="flex min-w-0 flex-[1.4_1_420px] flex-col gap-4 rounded-[20px] border bg-card p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-extrabold">Add a bus</h2>
            <span className="text-[13px] text-muted-foreground">It starts active and unassigned.</span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
              <label htmlFor="plate" className="text-[13px] font-bold">
                Plate number
              </label>
              <Input id="plate" required maxLength={20} value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} placeholder="NCV 1105" className={fieldClass} />
            </div>
            <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
              <label htmlFor="bus-name" className="text-[13px] font-bold">
                Name
              </label>
              <Input id="bus-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bus 5" className={fieldClass} />
            </div>
            <button
              type="submit"
              disabled={create.isPending}
              className="flex h-11 items-center gap-2 rounded-xl bg-[#c2410c] px-5 text-sm font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              <Plus className="size-4" strokeWidth={2.6} aria-hidden /> Add bus
            </button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3.5" aria-label="Fleet">
        <h2 className="text-xl font-extrabold tracking-tight">Fleet</h2>
        {isLoading && <Skeleton className="h-40 w-full rounded-[20px]" />}
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        {buses?.length === 0 && <p className="rounded-[20px] border border-dashed p-6 text-sm text-muted-foreground">No buses yet.</p>}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {buses?.map((bus, i) => {
            const inactive = bus.status !== 'active';
            return (
              <div key={bus.id} className="flex flex-col overflow-hidden rounded-[20px] border bg-card transition-all duration-150 hover:-translate-y-[3px] hover:shadow-[0_14px_28px_-14px_rgba(15,23,42,.35)]">
                <div className="flex items-center gap-3.5 px-[18px] py-4 text-white" style={{ background: inactive ? '#64748b' : CARD_COLORS[i % CARD_COLORS.length] }}>
                  <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-white/20 text-lg font-extrabold">{busNumber(bus.name)}</span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[17px] font-extrabold">{bus.name}</span>
                    <span className="text-xs opacity-90">{bus.plateNumber}</span>
                  </div>
                  <button type="button" aria-label={`Delete ${bus.name}`} onClick={() => confirmDelete(bus)} className="grid size-10 shrink-0 place-items-center rounded-[10px] text-white hover:bg-[#be123c]">
                    <Trash2 className="size-[17px]" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 px-[18px] pb-[18px] pt-4">
                  <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground">
                    Name
                    <Input aria-label={`Name of ${bus.plateNumber}`} key={`n-${bus.id}-${bus.name}`} defaultValue={bus.name} onBlur={(e) => editText(bus, 'name', e.target.value)} className={fieldClass} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground">
                    Plate
                    <Input aria-label={`Plate of ${bus.name}`} key={`p-${bus.id}-${bus.plateNumber}`} defaultValue={bus.plateNumber} onBlur={(e) => editText(bus, 'plateNumber', e.target.value)} className={fieldClass} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground">
                    Status
                    <NativeSelect
                      aria-label={`Status of ${bus.name}`}
                      value={bus.status}
                      onChange={(e) => update.mutate({ id: bus.id, status: e.target.value as BusStatus }, { onError: fail })}
                      className={fieldClass}
                    >
                      {BUS_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground">
                    Konduktor
                    <NativeSelect
                      aria-label={`Konduktor of ${bus.name}`}
                      value={bus.konduktor?.id ?? ''}
                      onChange={(e) =>
                        assign.mutate(
                          { busId: bus.id, konduktorId: e.target.value || null },
                          { onSuccess: () => toast.success('Assignment saved'), onError: fail },
                        )
                      }
                      className={fieldClass}
                    >
                      <option value="">Unassigned</option>
                      {konduktors?.map((k) => {
                        const takenElsewhere = k.bus !== null && k.bus.id !== bus.id;
                        return (
                          <option key={k.id} value={k.id} disabled={takenElsewhere || !k.isActive}>
                            {k.fullName}
                            {takenElsewhere ? ` (on ${k.bus?.name})` : ''}
                            {!k.isActive ? ' (inactive)' : ''}
                          </option>
                        );
                      })}
                    </NativeSelect>
                  </label>
                  <Mode bus={bus} />
                </div>
              </div>
            );
          })}
        </div>
        {paged && <Pagination page={paged} onPage={setPageNo} busy={isPlaceholderData} label="Buses pages" />}
      </section>
    </div>
  );
}
