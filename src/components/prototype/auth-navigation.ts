export type AuthStatus = {
  configured: boolean; ownerEmail: string; setupRequired: boolean;
  user: { id: string; email: string } | null; recoveryAuthorized?: boolean;
};

/** Only resume local application paths; reject external URLs and login loops. */
export function safeNextPath(value: string | null, origin: string): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname === '/login' || url.pathname === '/reset-password') return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
