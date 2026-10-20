import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, Mail, Ticket } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AuthCard } from '@/components/layout/auth-card';
import { AuthField } from '@/components/layout/auth-field';
import { ROLE_HOME } from '@/app/config/nav.config';
import { errorMessage, useLogin, useLogout } from '@/features/auth/use-auth';
import { isKonduktorApp } from '@/lib/native-app';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  const logout = useLogout();
  // Inside the konduktor's Android app only a konduktor may sign in, and there is no passenger sign-up.
  const inKonduktorApp = isKonduktorApp();
  const [refused, setRefused] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: (user) => {
          if (inKonduktorApp && user.role !== 'konduktor') {
            logout.mutate(undefined, { onSuccess: () => setRefused('This app is for konduktors. Please use the BRT website or your passenger app.') });
            return;
          }
          setRefused(null);
          const from = (location.state as { from?: string } | null)?.from;
          navigate(from && from !== '/login' ? from : ROLE_HOME[user.role], { replace: true });
        },
      },
    );
  }

  return (
    <AuthCard variant="signin">
      <form onSubmit={submit} className="flex flex-col gap-4 min-[960px]:gap-[18px]">
        <div className="flex flex-col gap-1 min-[960px]:gap-1.5">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em] min-[960px]:text-3xl">Welcome back</h1>
          <p className="text-sm text-muted-foreground min-[960px]:text-[15px]">Sign in to your BRT account.</p>
        </div>
        {new URLSearchParams(location.search).get('sso') === 'failed' && (
          <Alert className="border-warning/60">
            <AlertDescription>That sign-in link has expired or was already used. Go back to the app and open Tickets again.</AlertDescription>
          </Alert>
        )}
        {refused && (
          <Alert className="border-destructive/50 text-destructive" role="alert">
            <AlertDescription>{refused}</AlertDescription>
          </Alert>
        )}
        {login.error && (
          <Alert className="border-destructive/50 text-destructive">
            <AlertDescription>{errorMessage(login.error)}</AlertDescription>
          </Alert>
        )}
        <AuthField id="email" label="Email" icon={Mail} tone="indigo" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <AuthField id="password" label="Password" icon={Lock} tone="indigo" type="password" reveal autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button
          type="submit"
          disabled={login.isPending}
          className="flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-[#4f46e5] text-[17px] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60 min-[960px]:h-[54px] min-[960px]:rounded-[14px] min-[960px]:text-base"
        >
          {login.isPending ? (
            'Signing in…'
          ) : (
            <>
              Sign in <ArrowRight className="size-[18px] max-[959px]:hidden" strokeWidth={2.4} aria-hidden />
            </>
          )}
        </button>
        {!inKonduktorApp && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground max-[959px]:hidden" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              New here?
              <span className="h-px flex-1 bg-border" />
            </div>
            <Link
              to="/register"
              className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border-[1.5px] bg-card text-[15px] font-extrabold text-foreground transition-colors hover:bg-surface-2 min-[960px]:h-[50px] min-[960px]:rounded-[14px] min-[960px]:bg-transparent"
            >
              <Ticket className="size-[18px] text-[#be185d]" strokeWidth={2.2} aria-hidden />
              Create a passenger account
            </Link>
          </>
        )}
      </form>
    </AuthCard>
  );
}
