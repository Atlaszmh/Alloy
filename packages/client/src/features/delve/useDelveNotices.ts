import { useEffect } from 'react';
import { showToast } from '@/components/Toast';
import { useDelveStore } from '@/stores/delveStore';

/**
 * Show the Delve's waiting notices (an overtake, builds a realign or a save
 * migration changed) as toasts. Call it in a page that renders a
 * ToastContainer: the page's effect runs after its children's, so the
 * container is listening. Pass `enabled = false` while the page renders no
 * ToastContainer, and the notices wait for the next page. Taking them from
 * the store makes a StrictMode re-run a no-op.
 */
export function useDelveNotices(enabled = true): void {
  const count = useDelveStore((s) => s.notices.length);
  useEffect(() => {
    if (!enabled || count === 0) return;
    for (const text of useDelveStore.getState().takeNotices()) showToast(text);
  }, [count, enabled]);
}
