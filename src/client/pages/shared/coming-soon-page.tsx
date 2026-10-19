import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth/use-auth';

/** Placeholder landing page for a role until its real screens ship. Remove as phases land. */
export function ComingSoonPage({ title, phase, description }: { title: string; phase: string; description: string }) {
  const { data: user } = useCurrentUser();
  return (
    <div className="mx-auto max-w-xl p-4">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Signed in as {user?.fullName} ({user?.role})
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {description} Arrives in phase {phase}.
        </CardContent>
      </Card>
    </div>
  );
}
