import { useConfirm } from '@/components/confirm-dialog';
import { useState, type FormEvent } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { useCreateKonduktor, useDeleteKonduktor, useKonduktors, useUpdateKonduktor, type Konduktor } from '@/features/konduktors/use-konduktors';

const EMPTY = { fullName: '', email: '', employeeNo: '', phone: '', password: '' };

/** Admin: create konduktor accounts, edit, deactivate, reset passwords (KON-02). Assigning a bus is done on the Buses page. */
export function AdminKonduktorsPage() {
  const [pageNo, setPageNo] = useState(1);
  const { data: paged, isLoading, error, isPlaceholderData } = useKonduktors(pageNo);
  const konduktors = paged?.items;
  const create = useCreateKonduktor();
  const update = useUpdateKonduktor();
  const remove = useDeleteKonduktor();
  const { ask, dialog } = useConfirm();
  const [form, setForm] = useState(EMPTY);

  const fail = (e: unknown) => toast.error(errorMessage(e));
  const set = (field: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { ...form, phone: form.phone || undefined },
      {
        onSuccess: () => {
          toast.success('Konduktor account created');
          setForm(EMPTY);
        },
        onError: fail,
      },
    );
  }

  function editText(k: Konduktor, field: 'fullName' | 'employeeNo' | 'phone', value: string) {
    const trimmed = value.trim();
    if (trimmed === (k[field] ?? '')) return;
    if (!trimmed && field !== 'phone') return;
    update.mutate({ id: k.id, [field]: trimmed }, { onError: fail });
  }

  function resetPassword(k: Konduktor) {
    const password = window.prompt(`New password for ${k.fullName} (at least 8 characters):`);
    if (!password) return;
    update.mutate({ id: k.id, password }, { onSuccess: () => toast.success('Password changed'), onError: fail });
  }

  async function confirmDelete(k: Konduktor) {
    if (!(await ask({ title: `Delete ${k.fullName}?`, description: "Their login is removed too.", confirmLabel: "Delete", destructive: true }))) return;
    remove.mutate(k.id, { onSuccess: () => toast.success('Konduktor deleted'), onError: fail });
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      {dialog}
      <Card>
        <CardHeader>
          <CardTitle>Add a konduktor</CardTitle>
          <CardDescription>Creates the sign-in account and profile together. Assign them to a bus on the Buses page.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input aria-label="Full name" placeholder="Full name" required minLength={2} value={form.fullName} onChange={set('fullName')} />
            <Input aria-label="Email" type="email" placeholder="Email" required value={form.email} onChange={set('email')} />
            <Input aria-label="Employee number" placeholder="Employee no. (e.g. KND-004)" required maxLength={30} value={form.employeeNo} onChange={set('employeeNo')} />
            <Input aria-label="Phone" placeholder="Phone (optional)" maxLength={30} value={form.phone} onChange={set('phone')} />
            <Input aria-label="Password" type="password" placeholder="Initial password (8+ characters)" required minLength={8} maxLength={72} value={form.password} onChange={set('password')} />
            <Button type="submit" disabled={create.isPending}>
              <Plus /> Add konduktor
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Konduktors ({paged?.total ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {error && <p className="text-sm text-destructive">{error.message}</p>}
          {konduktors?.length === 0 && <p className="text-sm text-muted-foreground">No konduktors yet.</p>}
          {konduktors?.map((k) => (
            <div key={k.id} className="grid items-center gap-2 rounded border p-2 md:grid-cols-[1.2fr_8rem_9rem_1fr_auto]">
              <div className="min-w-0">
                <Input aria-label={`Name of ${k.email}`} key={`f-${k.id}-${k.fullName}`} defaultValue={k.fullName} onBlur={(e) => editText(k, 'fullName', e.target.value)} />
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{k.email}</p>
              </div>
              <Input aria-label={`Employee no. of ${k.fullName}`} key={`e-${k.id}-${k.employeeNo}`} defaultValue={k.employeeNo} onBlur={(e) => editText(k, 'employeeNo', e.target.value)} />
              <Input aria-label={`Phone of ${k.fullName}`} key={`p-${k.id}-${k.phone}`} defaultValue={k.phone ?? ''} placeholder="Phone" onBlur={(e) => editText(k, 'phone', e.target.value)} />
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={k.bus ? '' : 'text-muted-foreground'}>{k.bus ? `${k.bus.name} · ${k.bus.plateNumber}` : 'No bus'}</span>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={k.isActive} onChange={(e) => update.mutate({ id: k.id, isActive: e.target.checked }, { onError: fail })} />
                  Active
                </label>
              </div>
              <div className="flex">
                <Button variant="ghost" size="icon" aria-label={`Reset password of ${k.fullName}`} onClick={() => resetPassword(k)}>
                  <KeyRound />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Delete ${k.fullName}`} onClick={() => confirmDelete(k)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
          {paged && <Pagination page={paged} onPage={setPageNo} busy={isPlaceholderData} label="Konduktors pages" />}
        </CardContent>
      </Card>
    </div>
  );
}
