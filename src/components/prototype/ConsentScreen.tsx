'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/data-store';
import { useLocationSearch } from './auth-location';
import s from './prototype.module.css';
import a from './auth.module.css';

type Consent = { clientName: string; clientId: string; redirectUri: string; scope: string; csrfToken: string };
const scopes: Record<string, string> = {
  'nutrition:read': 'Read your food library, recipe templates, meal-prep batches and food diary.',
  'nutrition:write': 'Create or edit foods, recipe templates and logged meals in your food diary.',
  'workouts:read': 'Read your exercise library, workout sessions and saved gym locations.',
  'workouts:write': 'Create or edit exercises and workout sessions.',
};

export default function ConsentScreen() {
  const [data, setData] = useState<Consent | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const search = useLocationSearch();
  const requestId = new URLSearchParams(search).get('request_id') || '';
  const validRequest = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId);
  const displayedError = validRequest ? error : 'This connection request is missing or invalid. Start the connection again from your AI client.';
  const pending = loading && validRequest;

  useEffect(() => {
    if (!validRequest) return;
    const controller = new AbortController();
    void api<Consent>(`/api/oauth/consent?request_id=${encodeURIComponent(requestId)}`, { signal: controller.signal }).then(setData).catch(failure => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load this connection request.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, requestId, validRequest]);

  async function decide(decision: 'approve' | 'deny') {
    if (!data || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ redirectUrl: string }>('/api/oauth/consent', { method: 'POST', body: JSON.stringify({ requestId, decision, csrfToken: data.csrfToken }) });
      window.location.assign(result.redirectUrl);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not complete this connection.'); setBusy(false); }
  }

  return <div className={a.viewport}><main className={`${s.auth} ${s.card} ${s.stack} ${a.card}`}>
    <div className={s.subtle}>SANTORIO CONNECTION</div>
    <h1 className={s.title}>{pending ? 'Loading request…' : data ? `Connect ${data.clientName}?` : 'Connection unavailable'}</h1>
    {pending ? <p className={s.subtle} role="status">Checking the requested access…</p> : null}
    {displayedError ? <><p role="alert" className={s.error}>{displayedError}</p>{validRequest ? <div className={s.row}><button type="button" className={s.button} disabled={busy || pending} onClick={() => { setError(''); setData(null); setLoading(true); setAttempt(value => value + 1); }}>Reload request</button><a className={s.button} href={`/login?next=${encodeURIComponent(`/oauth/consent?request_id=${requestId}`)}`}>Sign in again</a></div> : null}</> : null}
    {data && !pending ? <>
      <p className={s.subtle}>This client is requesting the following access to your Santorio journal.</p>
      <ul className={a.scopeList}>{data.scope.split(' ').filter(Boolean).map(scope => <li key={scope}>{scopes[scope] || `Requested permission: ${scope}`}</li>)}</ul>
      <p className={`${s.subtle} ${a.identity}`}>Client identity: {data.clientId}</p>
      <p className={`${s.subtle} ${a.identity}`}>Returns to: {data.redirectUri}</p>
      <p className={s.subtle}>Additional permissions require a new approval. You can revoke this connection in Settings.</p>
      <div className={s.row}><button type="button" className={`${s.button} ${s.primary}`} disabled={busy} onClick={() => void decide('approve')}>{busy ? 'Returning to client…' : 'Allow access'}</button><button type="button" className={s.button} disabled={busy} onClick={() => void decide('deny')}>Cancel</button></div>
    </> : null}
    {!pending && !data ? <Link className={s.button} href="/">Back to journal</Link> : null}
  </main></div>;
}
