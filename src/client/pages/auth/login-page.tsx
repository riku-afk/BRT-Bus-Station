import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROLE_HOME } from '@/app/config/nav.config';
import { errorMessage, useLogin } from '@/features/auth/use-auth';
import { useSystemInfo } from '@/features/system/use-system';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@shared/demo/accounts';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: info } = useSystemInfo();
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
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Passengers, konduktors and admins sign in here.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-3">
            {login.error && (
              <Alert className="border-destructive/50 text-destructive">
                <AlertDescription>{errorMessage(login.error)}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              No account? <Link to="/register" className="text-primary underline">Register as a passenger</Link>
            </p>
          </form>
        </CardContent>
      </Card>

      {info?.showPocBanner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demo accounts</CardTitle>
            <CardDescription>Password for all: {DEMO_PASSWORD}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                className="flex items-center justify-between rounded px-2 py-1 text-left hover:bg-accent"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                }}
              >
                <span>{a.email}</span>
                <span className="text-xs text-muted-foreground">{a.role}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
