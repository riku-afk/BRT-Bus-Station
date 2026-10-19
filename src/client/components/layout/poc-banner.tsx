import { useSystemInfo } from '@/features/system/use-system';

/** Shown on every environment except production (see ARCHITECTURE.md). */
export function PocBanner() {
  const { data } = useSystemInfo();
  if (!data?.showPocBanner) return null;
  return (
    <>
    </>
    // <div role="status" className="bg-warning px-4 py-1.5 text-center text-xs font-medium text-warning-foreground">
    //   {data.pocDisclosure}
    // </div>
  );
}
