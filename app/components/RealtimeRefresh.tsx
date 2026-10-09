'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

/**
 * Subscribes to Supabase Realtime (WebSocket) changes on `documents` and
 * re-renders the current server page when one arrives, so status changes
 * (e.g. Pending → Signed → Filed) appear without a manual reload. Row-level
 * security still applies: a user only receives changes to rows they can read.
 */
export default function RealtimeRefresh({ filter }: { filter?: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`documents-${filter || 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents', ...(filter ? { filter } : {}) },
        () => {
          // Signing writes several updates in a row; refresh once they settle.
          clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 400);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [filter, router, supabase]);

  return null;
}
