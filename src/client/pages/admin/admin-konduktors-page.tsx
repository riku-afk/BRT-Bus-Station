import { useConfirm } from '@/components/confirm-dialog';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bus, IdCard, KeyRound, Plus, Smartphone, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageTitle } from '@/components/layout/page-title';
import { Pagination } from '@/components/pagination';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/features/auth/use-auth';
import { useCreateKonduktor, useDeleteKonduktor, useKonduktors, useUpdateKonduktor, type Konduktor } from '@/features/konduktors/use-konduktors';

const EMPTY = { fullName: '', email: '', employeeNo: '', phone: '', password: '' };
const VIOLET = '#7c3aed';
const AVATAR_COLORS = ['#7c3aed', '#be185d', '#c2410c', '#0f766e', '#2563eb', '#15803d'];
const whiteField = 'h-[46px] rounded-xl border-0 bg-white px-3.5 text-sm font-semibold text-[#1e1b4b] placeholder:text-[#6b6790] focus-visible:ring-[#facc15] focus-visible:ring-[3px] focus-visible:ring-offset-0';
const cardField = 'h-10 rounded-[10px] px-3 text-[13px] font-semibold focus-visible:ring-[#7c3aed]';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

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
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 md:px-8 md:pt-7">
      {dialog}
      <PageTitle
        icon={Users}
        color={VIOLET}
        title="Konduktors"
        description="Staff accounts and profiles. Assign them to a bus on the Buses page."
      >
        <span className="rounded-full bg-[#7c3aed] px-3.5 py-2 text-[13px] font-bold text-white">{paged?.total ?? 0} konduktors</span>
        <Link to="/admin/buses" className="rounded-full px-3.5 py-2 text-[13px] font-bold text-[#7c3aed] hover:underline dark:text-[#c4b5fd]" style={{ background: 'color-mix(in srgb, #7c3aed 12%, var(--surface))' }}>
          Go to Buses →
        </Link>
      </PageTitle>

      <form onSubmit={submit} className="relative flex flex-col gap-[18px] overflow-hidden rounded-[22px] bg-[#5b21b6] p-5 text-white sm:p-[26px]">
        <UserPlus aria-hidden strokeWidth={1.2} className="pointer-events-none absolute -right-[30px] -top-10 size-[220px] opacity-[0.12]" />
        <div className="relative flex flex-col gap-1">
          <h2 className="text-[22px] font-extrabold">Add a konduktor</h2>
          <p className="text-sm text-[#ddd6fe]">Creates the sign-in account and profile together.</p>
        </div>
        <div className="relative grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">
            Full name
            <Input aria-label="Full name" placeholder="Juan Dela Cruz" required minLength={2} value={form.fullName} onChange={set('fullName')} className={whiteField} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">
            Email
            <Input aria-label="Email" type="email" placeholder="konduktor4@brt.test" required value={form.email} onChange={set('email')} className={whiteField} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">
            Employee no.
            <Input aria-label="Employee number" placeholder="KND-004" required maxLength={30} value={form.employeeNo} onChange={set('employeeNo')} className={whiteField} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">
            Phone (optional)
            <Input aria-label="Phone" type="tel" placeholder="0917 100 0004" maxLength={30} value={form.phone} onChange={set('phone')} className={whiteField} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">
            Initial password
            <Input aria-label="Password" type="password" placeholder="8+ characters" required minLength={8} maxLength={72} value={form.password} onChange={set('password')} className={whiteField} />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="flex h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#facc15] text-sm font-extrabold text-[#1c1203] transition-colors hover:bg-[#fde047] disabled:opacity-60"
            >
              <Plus className="size-4" strokeWidth={2.6} aria-hidden /> Add konduktor
            </button>
          </div>
        </div>
      </form>

      <section className="flex flex-col gap-3.5" aria-label="Team">
        <h2 className="text-xl font-extrabold tracking-tight">Team</h2>
        {isLoading && <Skeleton className="h-40 w-full rounded-[20px]" />}
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        {konduktors?.length === 0 && <p className="rounded-[20px] border border-dashed p-6 text-sm text-muted-foreground">No konduktors yet.</p>}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {konduktors?.map((k, i) => (
            <div key={k.id} className={`flex flex-col gap-4 rounded-[20px] border bg-card p-5 transition-all duration-150 hover:-translate-y-[3px] hover:shadow-[0_14px_28px_-14px_rgba(15,23,42,.35)] ${k.isActive ? '' : 'opacity-70'}`}>
              <div className="flex items-center gap-3.5">
                <span className="grid size-[54px] shrink-0 place-items-center rounded-full text-lg font-extrabold text-white" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }} aria-hidden>
                  {initials(k.fullName)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Input
                    aria-label={`Name of ${k.email}`}
                    key={`f-${k.id}-${k.fullName}`}
                    defaultValue={k.fullName}
                    onBlur={(e) => editText(k, 'fullName', e.target.value)}
                    className="h-9 border-transparent bg-transparent px-2 text-[17px] font-extrabold hover:border-input focus-visible:ring-[#7c3aed]"
                  />
                  <span className="truncate px-2 text-[13px] text-muted-foreground">{k.email}</span>
                </div>
                <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-xs font-bold text-muted-foreground">
                  {k.isActive ? 'Active' : 'Inactive'}
                  <Switch color={VIOLET} aria-label={`${k.fullName} active`} checked={k.isActive} onChange={(e) => update.mutate({ id: k.id, isActive: e.target.checked }, { onError: fail })} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <IdCard className="size-3.5 text-[#7c3aed]" aria-hidden /> Employee no.
                  </span>
                  <Input aria-label={`Employee no. of ${k.fullName}`} key={`e-${k.id}-${k.employeeNo}`} defaultValue={k.employeeNo} onBlur={(e) => editText(k, 'employeeNo', e.target.value)} className={cardField} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="size-3.5 text-[#0f766e]" aria-hidden /> Phone
                  </span>
                  <Input aria-label={`Phone of ${k.fullName}`} key={`p-${k.id}-${k.phone}`} defaultValue={k.phone ?? ''} placeholder="Phone" onBlur={(e) => editText(k, 'phone', e.target.value)} className={cardField} />
                </label>
              </div>
              <span
                className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-bold"
                style={k.bus ? { background: '#dcfce7', color: '#166534' } : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                <Bus className="size-3.5" aria-hidden />
                {k.bus ? `${k.bus.name} · ${k.bus.plateNumber}` : 'No bus'}
              </span>

              <div className="flex items-center justify-between gap-2.5 border-t pt-3.5">
                <button
                  type="button"
                  aria-label={`Reset password of ${k.fullName}`}
                  onClick={() => resetPassword(k)}
                  className="flex h-10 items-center gap-2 rounded-[10px] border bg-card px-3.5 text-[13px] font-bold hover:bg-surface-2"
                >
                  <KeyRound className="size-[15px] text-[#7c3aed]" aria-hidden /> Reset password
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${k.fullName}`}
                  onClick={() => confirmDelete(k)}
                  className="grid size-10 place-items-center rounded-[10px] border bg-card text-muted-foreground hover:border-[#fecdd3] hover:bg-[#ffe4e6] hover:text-[#be123c] dark:hover:bg-[#be123c]/20"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {paged && <Pagination page={paged} onPage={setPageNo} busy={isPlaceholderData} label="Konduktors pages" />}
      </section>
    </div>
  );
}
