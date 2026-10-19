import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Button asChild>
        <Link to="/">Back to the map</Link>
      </Button>
    </div>
  );
}
