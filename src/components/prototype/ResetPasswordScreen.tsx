'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/data-store';
import type { AuthStatus } from './auth-navigation';
import s from './prototype.module.css';
import a from './auth.module.css';

export function PasswordResetRequest({ email, onBack }: { email: string; onBack?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await api<{ message: string }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email }) });
      setMessage(response.message || 'If this email has an account, a password reset link is on its way.'); setSent(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not request a reset link. Try again.'); }
    finally { setBusy(false); }
  }
  return <form className={s.stack} onSubmit={submit}>
    <p className={s.subtle}>We’ll email a link to choose a new password.</p>
    <label className={s.field}>Email<input className={s.input} type="email" autoComplete="username" value={email} readOnly /></label>
    {message ? <p className={a.message} role="status">{message}</p> : null}
    {sent ? <p className={s.subtle}>Check your inbox and spam folder. Open the link in the same browser where you requested it.</p> : null}
    {error ? <p className={s.error} role="alert">{error}</p> : null}
    <button type="submit" className={`${s.button} ${s.primary}`} disabled={busy}>{busy ? 'Sending reset link…' : sent ? 'Send another link' : 'Email reset link'}</button>
    {onBack ? <button type="button" className={a.textButton} onClick={onBack}>Back to sign in</button> : <a className={s.button} href="/login">Back to sign in</a>}
  </form>;
}

export default function ResetPasswordScreen() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [complete, setComplete] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void api<AuthStatus>('/api/auth/status', { signal: controller.signal }).then(setStatus).catch(failure => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not check this reset link.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !status?.recoveryAuthorized) return;
    if (password !== confirmation) { setError('The passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      await api<{ ok: true }>('/api/auth/update-password', { method: 'POST', body: JSON.stringify({ password }) });
      setPassword(''); setConfirmation(''); setComplete(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update your password. Request a new link if this one has expired.'); }
    finally { setBusy(false); }
  }

  return <div className={a.viewport}><main className={`${s.auth} ${s.card} ${s.stack} ${a.card}`}>
    <div className={s.subtle}>SANTORIO</div>
    <h1 className={s.title}>{complete ? 'Password updated' : loading ? 'Checking reset link…' : requesting ? 'Request a reset link' : 'Choose a new password'}</h1>
    {loading ? <p className={s.subtle} role="status">Checking this browser’s recovery session…</p> : complete ? <>
      <p className={a.message} role="status">Your password has been changed. Sign in again with your new password.</p>
      <p className={s.subtle}>After signing in, reconnect any AI clients you want to keep using.</p>
      <a className={`${s.button} ${s.primary}`} href="/login?reset=1">Back to sign in</a>
    </> : <>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
      {!status ? <button type="button" className={s.button} onClick={() => { setError(''); setLoading(true); setAttempt(value => value + 1); }}>Retry connection</button> : !status.configured ? <p className={s.error}>The server connection is not configured yet.</p> : requesting ? <PasswordResetRequest email={status.ownerEmail} /> : !status.recoveryAuthorized ? <>
        <p className={s.subtle}>This browser does not have an active password reset session. The link may have expired, been used, or opened in a different browser.</p>
        <button type="button" className={`${s.button} ${s.primary}`} onClick={() => { setRequesting(true); setError(''); }}>Request a new reset link</button>
        <a className={s.button} href="/login">Back to sign in</a>
      </> : <form className={s.stack} onSubmit={submit}>
        <p className={s.subtle}>Use at least 12 characters for {status.ownerEmail}.</p>
        <input className={a.hiddenUsername} type="email" autoComplete="username" value={status.ownerEmail} readOnly tabIndex={-1} aria-hidden="true" />
        <label className={s.field}>New password<input className={s.input} type="password" required autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label className={s.field}>Confirm new password<input className={s.input} type="password" required autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        <button type="submit" className={`${s.button} ${s.primary}`} disabled={busy}>{busy ? 'Updating password…' : 'Update password'}</button>
        <button type="button" className={a.textButton} onClick={() => { setRequesting(true); setError(''); setPassword(''); setConfirmation(''); }}>Need a new reset link?</button>
      </form>}
    </>}
  </main></div>;
}
