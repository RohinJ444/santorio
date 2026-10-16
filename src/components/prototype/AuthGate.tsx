'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '@/lib/data-store';
import { safeNextPath, type AuthStatus } from './auth-navigation';
import { useLocationSearch } from './auth-location';
import { PasswordResetRequest } from './ResetPasswordScreen';
import s from './prototype.module.css';
import a from './auth.module.css';

export default function AuthGate({ children }: { children: (user: { id: string; email: string }, reset: () => void) => ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [mode, setMode] = useState<'signin' | 'forgot' | null>(null);
  const [dismissQueryMessage, setDismissQueryMessage] = useState(false);
  const search = useLocationSearch();
  const query = new URLSearchParams(search);
  const next = safeNextPath(query.get('next'), typeof window === 'undefined' ? 'https://local.invalid' : window.location.origin);
  const recoveryRedirect = query.get('recovery') === '1';
  const forgot = mode === null ? query.get('forgot') === '1' : mode === 'forgot';
  const displayedError = error || (!dismissQueryMessage ? query.get('authError') || '' : '');
  const displayedMessage = message || (!dismissQueryMessage ? query.get('confirmed') === '1' ? 'Email confirmed. Sign in with your password.' : query.get('reset') === '1' ? 'Password updated. Sign in with your new password.' : '' : '');

  const load = useCallback(() => api<AuthStatus>('/api/auth/status')
    .then(result => {
      setStatus(result);
      return result;
    })
    .catch(failure => {
      setError(failure instanceof Error ? failure.message : 'Could not connect to your journal.');
      return null;
    })
    .finally(() => { setLoading(false); }), []);

  useEffect(() => {
    if (recoveryRedirect) {
      window.location.replace('/reset-password');
      return;
    }
    void load();
  }, [load, recoveryRedirect]);

  useEffect(() => {
    if (status?.user && next && !recoveryRedirect) window.location.replace(next);
  }, [status?.user, next, recoveryRedirect]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status || busy) return;
    const setup = status.setupRequired && !confirmationSent;
    if (setup && password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true); setError(''); setMessage(''); setDismissQueryMessage(true);
    try {
      const result = await api<{ message?: string }>(setup ? '/api/auth/signup' : '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: status.ownerEmail, password }) });
      setPassword(''); setConfirmPassword('');
      if (setup) {
        setConfirmationSent(true);
        setMessage(result.message || 'Check your email to confirm your account, then sign in here.');
      }
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not sign in. Please try again.');
    } finally { setBusy(false); }
  }

  if (status?.user && !next && !recoveryRedirect) return children(status.user, () => { setStatus(null); setLoading(true); setPassword(''); setConfirmPassword(''); setError(''); void load(); });
  const setup = status?.setupRequired && !confirmationSent;
  const booting = recoveryRedirect || (loading && !status) || Boolean(status?.user && next);

  if (booting) return <div className={a.splash} role="status" aria-label="Opening your journal">Santorio</div>;
  return <div className={a.viewport}><main className={`${s.auth} ${s.card} ${s.stack} ${a.card}`}>
    <div className={s.subtle}>SANTORIO</div>
    <h1 className={s.title}>{booting ? 'Opening your journal…' : forgot ? 'Reset your password' : setup ? 'Your private journal' : 'Welcome back'}</h1>
    {booting ? <p className={s.subtle} role="status">Checking your connection…</p> : <>
      {!forgot ? <p className={s.subtle}>{setup ? 'Choose a password, then verify your email to open your journal.' : 'Sign in to your workout and nutrition journal.'}</p> : null}
      {displayedError ? <p className={s.error} role="alert">{displayedError}</p> : null}
      {displayedMessage ? <p className={a.message} role="status">{displayedMessage}</p> : null}
      {!status ? <button type="button" className={s.button} onClick={() => { setError(''); setLoading(true); void load(); }}>Retry connection</button> : !status.configured ? <><p className={s.error}>The server connection is not configured yet.</p><button type="button" className={s.button} onClick={() => { setError(''); setLoading(true); void load(); }}>Check again</button></> : forgot ? <PasswordResetRequest email={status.ownerEmail} onBack={() => { setMode('signin'); setError(''); setMessage(''); setDismissQueryMessage(true); }} /> : <form className={s.stack} onSubmit={submit}>
        <label className={s.field}>Email<input className={s.input} type="email" autoComplete="username" value={status.ownerEmail} readOnly /></label>
        <label className={s.field}>{setup ? 'Choose a password' : 'Password'}<input className={s.input} type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={setup ? 12 : 1} maxLength={setup ? 128 : 256} required autoComplete={setup ? 'new-password' : 'current-password'} aria-describedby={setup ? 'password-requirements' : undefined} /></label>
        {setup ? <><p id="password-requirements" className={s.subtle}>Use at least 12 characters.</p><label className={s.field}>Confirm password<input className={s.input} type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required autoComplete="new-password" /></label></> : null}
        <button type="submit" className={`${s.button} ${s.primary}`} disabled={busy || loading}>{busy ? setup ? 'Creating account…' : 'Signing in…' : setup ? 'Create my account' : 'Sign in'}</button>
        {!setup ? <button type="button" className={a.textButton} onClick={() => { setMode('forgot'); setError(''); setMessage(''); setPassword(''); setDismissQueryMessage(true); }}>Forgot password?</button> : null}
      </form>}
    </>}
  </main></div>;
}
