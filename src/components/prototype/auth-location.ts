'use client';

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}

/** URL state is external to React; the empty server snapshot keeps hydration stable. */
export function useLocationSearch() {
  return useSyncExternalStore(subscribe, () => window.location.search, () => '');
}
