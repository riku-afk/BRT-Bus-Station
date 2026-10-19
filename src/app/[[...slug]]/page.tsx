'use client';

import dynamic from 'next/dynamic';

// The whole UI is a React Router SPA (src/client). Next only mounts it.
// Do not add Next.js App Router pages for application screens.
const BusStationApp = dynamic(() => import('@/App'), { ssr: false });

export default function Page() {
  return <BusStationApp />;
}
