'use client';

import { useEffect, useState } from 'react';

import { getSocket } from '@/lib/socket';

/**
 * Reflects the real Socket.IO connection state (Phase 2):
 * green "Live" while connected, amber "Reconnecting…" otherwise.
 */
export function LiveIndicator({ label }: { label?: string }) {
  const [connected, setConnected] = useState<boolean>(() => getSocket().connected);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    setConnected(socket.connected);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        connected
          ? 'border-[var(--st-ready)]/30 bg-[var(--st-ready)]/10 text-[var(--st-ready)]'
          : 'border-[var(--st-preparing)]/30 bg-[var(--st-preparing)]/10 text-[var(--st-preparing)]'
      }`}
      role="status"
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${connected ? 'bg-[var(--st-ready)]' : 'bg-[var(--st-preparing)]'}`} />
      {label ? `${label} · ${connected ? 'Live' : 'Reconnecting…'}` : connected ? 'Live' : 'Reconnecting…'}
    </span>
  );
}
