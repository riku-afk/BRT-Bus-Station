import { useConfirm } from '@/components/confirm-dialog';
import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/pagination';
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
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      {dialog}
      <Card>
        <CardHeader>
          <CardTitle>Add a bus</CardTitle>
          <CardDescription>
            A bus with a konduktor waits at a station until that konduktor dispatches it. A bus without one runs the line automatically. Passengers buy tickets on a bus that is waiting
            at a shelter, so only buses with a konduktor sell tickets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="plate" className="text-sm font-medium">Plate number</label>
              <Input id="plate" required maxLength={20} value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} placeholder="NCV 1105" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bus-name" className="text-sm font-medium">Name</label>
              <Input id="bus-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bus 5" />
            </div>
            <Button type="submit" disabled={create.isPending}>
              <Plus /> Add bus
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buses ({paged?.total ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {error && <p className="text-sm text-destructive">{error.message}</p>}
          {buses?.length === 0 && <p className="text-sm text-muted-foreground">No buses yet.</p>}
          {buses?.map((bus) => (
            <div key={bus.id} className="grid items-center gap-2 rounded border p-2 md:grid-cols-[1fr_1fr_9rem_14rem_auto]">
              <Input aria-label={`Name of ${bus.plateNumber}`} key={`n-${bus.id}-${bus.name}`} defaultValue={bus.name} onBlur={(e) => editText(bus, 'name', e.target.value)} />
              <Input aria-label={`Plate of ${bus.name}`} key={`p-${bus.id}-${bus.plateNumber}`} defaultValue={bus.plateNumber} onBlur={(e) => editText(bus, 'plateNumber', e.target.value)} />
              <NativeSelect
                aria-label={`Status of ${bus.name}`}
                value={bus.status}
                onChange={(e) => update.mutate({ id: bus.id, status: e.target.value as BusStatus }, { onError: fail })}
              >
                {BUS_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label={`Konduktor of ${bus.name}`}
                value={bus.konduktor?.id ?? ''}
                onChange={(e) =>
                  assign.mutate(
                    { busId: bus.id, konduktorId: e.target.value || null },
                    { onSuccess: () => toast.success('Assignment saved'), onError: fail },
                  )
                }
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
              <Button variant="ghost" size="icon" aria-label={`Delete ${bus.name}`} onClick={() => confirmDelete(bus)}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {paged && <Pagination page={paged} onPage={setPageNo} busy={isPlaceholderData} label="Buses pages" />}
        </CardContent>
      </Card>
    </div>
  );
}
