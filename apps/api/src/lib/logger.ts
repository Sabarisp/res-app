export const logger = {
  info: (...args: unknown[]) => console.info('[api]', ...args),
  warn: (...args: unknown[]) => console.warn('[api]', ...args),
  error: (...args: unknown[]) => console.error('[api]', ...args),
};
