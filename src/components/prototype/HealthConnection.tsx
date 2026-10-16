'use client';

import { useEffect, useRef, useState } from 'react';
import { api, useData } from '@/lib/data-store';
import s from './prototype.module.css';
import n from './nutrition.module.css';
import h from './health.module.css';

type ImportResult = {
  ok: true; created: number; updated: number; unchanged: number;
  counts: { days: number; workouts: number; measurements: number };
  warnings: string[]; importedAt: string;
};
type Connection = {
  connected: boolean; createdAt: string | null; lastImportedAt: string | null;
  lastResult?: ImportResult | null; endpoint: string;
};
const MAX_FILE_BYTES = 3_000_000;

function ImportSummary({ result }: { result: ImportResult }) {
  return <div className={h.importSummary} role="status">
    <p>{result.counts.days} activity {result.counts.days === 1 ? 'day' : 'days'} · {result.counts.workouts} Watch {result.counts.workouts === 1 ? 'workout' : 'workouts'} · {result.counts.measurements} body {result.counts.measurements === 1 ? 'measurement' : 'measurements'}</p>
    <p className={n.mutedNotice}>{result.created} new · {result.updated} updated · {result.unchanged} unchanged. Repeated uploads do not add calories again.</p>
    {result.warnings.length ? <ul className={h.warnings}>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
  </div>;
}

export default function HealthConnection() {
  const { refresh, profile, pendingCount } = useData();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [token, setToken] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'token' | 'revoke' | 'upload' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api<Connection>('/api/health/connection').then(value => { if (active) setConnection(value); })
      .catch(reason => { if (active) setError((reason as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const formatDate = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: profile.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const reloadConnection = async () => setConnection(await api<Connection>('/api/health/connection'));
  const createToken = async () => {
    if (connection?.connected && !window.confirm('Replace the Health import token? Both exporter automations will need the new token.')) return;
    setBusy('token'); setError(''); setNotice('');
    try {
      const value = await api<{ token: string; endpoint: string; createdAt: string }>('/api/health/connection', { method: 'POST' });
      setToken(value.token);
      setConnection(previous => ({ connected: true, createdAt: value.createdAt, lastImportedAt: previous?.lastImportedAt ?? null, lastResult: previous?.lastResult, endpoint: value.endpoint }));
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(null); }
  };
  const revoke = async () => {
    if (!window.confirm('Revoke the Health import token? Automatic uploads will stop; your imported records stay saved.')) return;
    setBusy('revoke'); setError(''); setNotice('');
    try {
      await api('/api/health/connection', { method: 'DELETE' });
      setToken(''); setConnection(previous => previous ? { ...previous, connected: false, createdAt: null } : previous);
      setNotice('Import token revoked. Existing Health records are unchanged.');
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(null); }
  };
  const copy = async (value: string, description: string) => {
    try { await navigator.clipboard.writeText(value); setNotice(`${description} copied.`); }
    catch { setError('Could not access the clipboard. Select and copy the text instead.'); }
  };
  const upload = async () => {
    if (!file || busy || pendingCount) return;
    setBusy('upload'); setError(''); setNotice(''); setResult(null);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Choose a JSON export smaller than 3 MB. Export a shorter date range if needed.');
      const raw = await file.text();
      try { JSON.parse(raw); } catch { throw new Error('This file is not valid JSON. Choose a JSON version 2 export from Health Auto Export.'); }
      const imported = await api<ImportResult>('/api/health/upload', { method: 'POST', headers: { 'X-Santorio-Aggregation': 'days' }, body: raw });
      setResult(imported); setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await Promise.all([refresh(), reloadConnection()]);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(null); }
  };
  const localEndpoint = connection?.endpoint ? /^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(connection.endpoint) : false;
  return <section className={s.card} aria-labelledby="health-connection-heading">
    <h2 className={s.sectionTitle} id="health-connection-heading">Apple Health</h2>
    <p className={n.help}>Bring in activity and Watch workouts through Health Auto Export. Active calories and resting energy stay separate; workout calories are already included in daily active energy.</p>
    {loading ? <p className={s.subtle}>Loading connection…</p> : <p className={s.subtle}>{connection?.connected ? 'Import token enabled.' : 'Automatic uploads are not connected.'}{connection?.lastImportedAt ? ` Last received ${formatDate(connection.lastImportedAt)}.` : ' No upload received yet.'}</p>}
    <div className={s.stack}>
      {connection ? <>
        <div className={s.row}><button type="button" className={s.button} disabled={!!busy} onClick={() => void createToken()}>{busy === 'token' ? 'Creating…' : connection.connected ? 'Replace import token' : 'Create import token'}</button>{connection.connected ? <button type="button" className={`${s.button} ${s.danger}`} disabled={!!busy} onClick={() => void revoke()}>{busy === 'revoke' ? 'Revoking…' : 'Revoke token'}</button> : null}</div>
        <label className={s.field}>REST API URL<input className={s.input} readOnly value={connection.endpoint} onFocus={event => event.currentTarget.select()} /></label>
        <button type="button" className={s.button} onClick={() => void copy(connection.endpoint, 'Endpoint')}>Copy URL</button>
        {localEndpoint ? <p className={n.help}>This is the local development URL. For uploads from your phone, open the deployed Santorio settings and copy its HTTPS URL after this integration is deployed.</p> : null}
        {token ? <div className={h.tokenBox}>
          <strong>Copy this token into both automations</strong>
          <p className={n.help}>It is shown only here, until you leave this screen. You can replace it later.</p>
          <label className={s.field}>Authorization header value<textarea className={`${s.input} ${h.token}`} readOnly rows={3} value={`Bearer ${token}`} onFocus={event => event.currentTarget.select()} spellCheck={false} /></label>
          <div className={s.row}><button type="button" className={s.button} onClick={() => void copy(`Bearer ${token}`, 'Authorization value')}>Copy authorization value</button><button type="button" className={s.button} onClick={() => setToken('')}>Hide token</button></div>
        </div> : null}
      </> : !loading ? <button type="button" className={s.button} onClick={() => { setError(''); void reloadConnection().catch(reason => setError((reason as Error).message)); }}>Retry connection</button> : null}
      <details className={h.instructions}>
        <summary>Set up Health Auto Export</summary>
        <p className={n.help}>Create two REST API automations in Health Auto Export, using the same URL and token above. Choose JSON, export version 2, and POST.</p>
        <dl className={h.headers}><div><dt>Content-Type</dt><dd>application/json</dd></div><div><dt>Authorization</dt><dd>Bearer followed by your import token</dd></div></dl>
        <ol className={h.steps}>
          <li><strong>Daily activity</strong><p>Select Health Metrics: Active Energy, Basal Energy Burned, Apple Exercise Time, and Step Count. Turn on Summarize Data, with time grouping Days. Set Date Range to Default (yesterday and today), so late updates replace earlier totals. Do not use Since Last Sync for daily totals.</p><p>Add header <code>Automation-Aggregation</code> with value <code>days</code>.</p></li>
          <li><strong>Watch workouts</strong><p>Select Workouts. Include Workout Metrics with time grouping Minutes. Keep routes off. Set Date Range to Default (yesterday and today). This automation does not need the aggregation header.</p></li>
        </ol>
        <p className={n.help}>Run each automation manually once and check the import result here before enabling its schedule. Background exports can arrive late. An imported day is not assumed complete just because its date has passed.</p>
        <p className={n.help}><a href="https://help.healthyapps.dev/en/health-auto-export/automations/rest-api/" target="_blank" rel="noreferrer">Health Auto Export REST API guide ↗</a></p>
      </details>
      <details className={h.instructions}>
        <summary>Import a JSON file now</summary>
        <p className={n.help}>Choose a JSON version 2 export. Daily health metrics must use Summarize Data with Days grouping; workout metrics can use Minutes. Re-importing replaces matching records instead of adding their values together.</p>
        <label className={s.field}>Health Auto Export JSON<input ref={fileInput} className={s.input} type="file" accept=".json,application/json" disabled={!!busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); setResult(null); }} /></label>
        {file ? <p className={n.mutedNotice}>{file.name} · {(file.size / 1024).toFixed(0)} KB</p> : null}
        <button type="button" className={s.button} disabled={!file || !!busy || pendingCount > 0} onClick={() => void upload()}>{busy === 'upload' ? 'Importing…' : 'Import file'}</button>
        {pendingCount ? <p className={n.mutedNotice}>Waiting for your journal changes to sync before importing.</p> : null}
      </details>
      {result ? <ImportSummary result={result} /> : connection?.lastResult ? <details className={h.instructions}><summary>Last import result</summary><ImportSummary result={connection.lastResult} /></details> : null}
      {notice ? <p className={n.mutedNotice} role="status">{notice}</p> : null}
      {error ? <p className={s.error} role="alert">{error}</p> : null}
      <p className={n.mutedNotice}>Birthday, equation coefficient, goals, and preferences remain manual. Missing Health values stay unknown.</p>
    </div>
  </section>;
}
