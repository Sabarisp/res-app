'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { ApiRequestError } from '@/lib/api';

/**
 * Shared API-error pattern (Phase 1):
 * - 401 -> redirect to /login
 * - 403 -> caller shows a "no access" state via `forbidden` flag
 * - anything else -> caller renders ErrorState with retry; never an empty list
 */
export function useApiError() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);

  const handleError = useCallback((err: unknown, fallback: string): string => {
    setForbidden(false);
    if (err instanceof ApiRequestError) {
      if (err.status === 401) {
        router.push('/login');
        return 'Your session expired. Redirecting to login…';
      }
      if (err.status === 403) {
        setForbidden(true);
        return 'You do not have access to this area.';
      }
      return err.message || fallback;
    }
    return err instanceof Error ? err.message : fallback;
  }, [router]);

  const clearForbidden = useCallback(() => setForbidden(false), []);

  return { forbidden, handleError, clearForbidden };
}
