'use client';

import { useEffect, useState } from 'react';

export function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const tone = minutes >= 15 ? 'text-[var(--st-late)]' : minutes >= 8 ? 'text-[var(--st-preparing)]' : 'text-[var(--ink)]';

  return <time dateTime={startedAt} className={`tabular-nums font-semibold ${tone}`}>{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</time>;
}
