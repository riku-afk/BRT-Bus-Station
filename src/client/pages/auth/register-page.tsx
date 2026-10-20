import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/layout/auth-card';
import { errorMessage, useRegister } from '@/features/auth/use-auth';

export function RegisterPage() {
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
    <AuthCard title="Create a passenger account" description="Buy tickets and keep them in one place.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {register.error && (
          <Alert className="border-destructive/50 text-destructive">
            <AlertDescription>{errorMessage(register.error)}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName" className="text-[13px] font-bold">
            Full name
          </Label>
          <Input id="fullName" autoComplete="name" required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12" />
        </div>
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
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <button type="submit" disabled={register.isPending} className="h-[52px] rounded-xl bg-[#be185d] text-[15px] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60">
          {register.isPending ? 'Creating…' : 'Create account'}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Already registered?{' '}
          <Link to="/login" className="font-bold text-[#4f46e5] hover:underline dark:text-[#a5b4fc]">
            Sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
