import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Lock, Mail, User } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AuthCard } from '@/components/layout/auth-card';
import { AuthField } from '@/components/layout/auth-field';
import { errorMessage, useRegister } from '@/features/auth/use-auth';
import { isKonduktorApp } from '@/lib/native-app';

/** Konduktors do not register themselves (an admin creates their account), so inside the konduktor app this page is not offered. */
export function RegisterPage() {
  return isKonduktorApp() ? <Navigate to="/login" replace /> : <RegisterForm />;
}

const MIN_LENGTH = 8;

/** How strong the password looks while it is typed: 0 nothing, 1 too short, 3 long enough, 4 long. Only the length is checked, as on the server. */
export function passwordStrength(password: string): { level: 0 | 1 | 3 | 4; hint: string } {
  const n = password.length;
  if (n === 0) return { level: 0, hint: `At least ${MIN_LENGTH} characters.` };
  if (n < MIN_LENGTH) return { level: 1, hint: `${MIN_LENGTH - n} more character${MIN_LENGTH - n === 1 ? '' : 's'} needed.` };
  return { level: n < 12 ? 3 : 4, hint: 'Looks good.' };
}

function StrengthMeter({ id, password }: { id: string; password: string }) {
  const { level, hint } = passwordStrength(password);
  const color = level >= 3 ? '#16a34a' : '#f59e0b';
  return (
    <p id={id} className={`flex items-center gap-2 text-xs font-semibold ${level >= 3 ? 'text-[#15803d] dark:text-[#4ade80]' : level === 1 ? 'text-[#b45309] dark:text-[#fbbf24]' : 'text-muted-foreground'}`}>
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-[5px] w-[22px] rounded-[3px] bg-border min-[960px]:w-[26px]" style={i < level ? { background: color } : undefined} />
        ))}
      </span>
      {hint}
    </p>
  );
}

function RegisterForm() {
  const navigate = useNavigate();
  const register = useRegister();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    register.mutate({ fullName, email, password }, { onSuccess: () => navigate('/', { replace: true }) });
  }

  return (
    <AuthCard variant="register">
      <form onSubmit={submit} className="flex flex-col gap-3.5 min-[960px]:gap-[18px]">
        <div className="flex flex-col gap-1.5 min-[960px]:gap-2">
          <span className="self-start rounded-full bg-[#0369a1] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-white">Passenger account</span>
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em] min-[960px]:text-3xl">Create your account</h1>
          <p className="text-sm text-muted-foreground max-[959px]:hidden min-[960px]:text-[15px]">Buy tickets and keep them in one place.</p>
        </div>
        {register.error && (
          <Alert className="border-destructive/50 text-destructive">
            <AlertDescription>{errorMessage(register.error)}</AlertDescription>
          </Alert>
        )}
        <AuthField id="fullName" label="Full name" icon={User} tone="pink" autoComplete="name" placeholder="Maria Santos" required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <AuthField id="email" label="Email" icon={Mail} tone="pink" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="flex flex-col gap-2">
          <AuthField
            id="password"
            label="Password"
            icon={Lock}
            tone="pink"
            type="password"
            reveal
            autoComplete="new-password"
            aria-describedby="password-hint"
            required
            minLength={MIN_LENGTH}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <StrengthMeter id="password-hint" password={password} />
        </div>
        <button
          type="submit"
          disabled={register.isPending}
          className="h-14 rounded-2xl bg-[#be185d] text-[17px] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60 min-[960px]:h-[54px] min-[960px]:rounded-[14px] min-[960px]:text-base"
        >
          {register.isPending ? 'Creating…' : 'Create account'}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Already registered?{' '}
          <Link to="/login" className="font-extrabold text-[#4f46e5] hover:underline dark:text-[#a5b4fc]">
            Sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
