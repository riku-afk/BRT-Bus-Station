import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/layout/auth-card';
import { ROLE_HOME } from '@/app/config/nav.config';
import { errorMessage, useLogin } from '@/features/auth/use-auth';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: (user) => {
          const from = (location.state as { from?: string } | null)?.from;
          navigate(from && from !== '/login' ? from : ROLE_HOME[user.role], { replace: true });
        },
      },
    );
  }

  return (
    <AuthCard title="Sign in" description="Passengers, konduktors and admins sign in here.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {login.error && (
          <Alert className="border-destructive/50 text-destructive">
            <AlertDescription>{errorMessage(login.error)}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-[13px] font-bold">
            Email
          </Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="text-[13px] font-bold">
            Password
          </Label>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
        </div>
        <button type="submit" disabled={login.isPending} className="h-[52px] rounded-xl bg-[#4f46e5] text-[15px] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60">
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link to="/register" className="font-bold text-[#4f46e5] hover:underline dark:text-[#a5b4fc]">
            Register as a passenger
          </Link>
        </p>
      </form>

      {/* {info?.showPocBanner && (
        <div className="mt-5 flex flex-col gap-2 border-t pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-extrabold">Demo accounts</h2>
            <span className="text-xs text-muted-foreground">Password for all: {DEMO_PASSWORD}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                className="flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                }}
              >
                <span className="truncate font-semibold">{a.email}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${ROLE_BADGE[a.role] ?? 'bg-surface-2'}`}>{a.role}</span>
              </button>
            ))}
          </div>
        </div>
      )} */}
    </AuthCard>
  );
}
