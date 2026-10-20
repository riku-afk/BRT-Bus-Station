import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches, live. Where there is no matchMedia (a test, the server) it says yes, i.e. the wide layout. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => (typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia(query).matches),
    () => true,
  );
}

/** md and up in Tailwind: the layout with a side bar and room for everything on one page. */
export const useIsWide = () => useMediaQuery('(min-width: 768px)');
