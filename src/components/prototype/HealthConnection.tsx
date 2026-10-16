'use client';

import { useEffect, useRef, useState } from 'react';
import { api, useData } from '@/lib/data-store';
import s from './prototype.module.css';
import n from './nutrition.module.css';
import h from './health.module.css';
import st from './settings.module.css';
import { Row } from './ProfileParts';

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
  return <><h2 className={st.groupTitle} id="health-connection-heading">Apple Health</h2><section className={st.group} aria-labelledby="health-connection-heading">
    <Row label={loading ? 'Loading…' : connection?.connected ? 'Connected' : 'Not connected'} hint={connection?.lastImportedAt ? `Last received ${formatDate(connection.lastImportedAt)}` : 'No upload received yet'}>
      {connection ? <><button type="button" className={`${st.pill} ${st.ghost}`} disabled={!!busy} onClick={() => void createToken()}>{busy === 'token' ? 'Creating…' : connection.connected ? 'New token' : 'Create token'}</button>{connection.connected ? <button type="button" className={`${st.pill} ${st.ghost}`} style={{ color: '#ff9d94' }} disabled={!!busy} onClick={() => void revoke()}>{busy === 'revoke' ? 'Revoking…' : 'Revoke'}</button> : null}</> : !loading ? <button type="button" className={`${st.pill} ${st.ghost}`} onClick={() => { setError(''); void reloadConnection().catch(reason => setError((reason as Error).message)); }}>Retry</button> : null}
    </Row>
    {connection ? <Row label="Upload URL" hint={localEndpoint ? 'Local URL. Use the deployed app’s URL on your phone.' : undefined}><button type="button" className={`${st.pill} ${st.ghost}`} onClick={() => void copy(connection.endpoint, 'Upload URL')} title={connection.endpoint}>Copy</button></Row> : null}
    {token ? <div className={h.tokenBox}>
      <strong>Paste this into both automations</strong>
      <p className={st.note}>Shown only until you leave this screen. As the Authorization header value:</p>
      <textarea className={`${s.input} ${h.token}`} readOnly rows={2} value={`Bearer ${token}`} onFocus={event => event.currentTarget.select()} spellCheck={false} aria-label="Authorization header value" />
      <div className={s.row}><button type="button" className={st.pill} onClick={() => void copy(`Bearer ${token}`, 'Authorization value')}>Copy</button><button type="button" className={`${st.pill} ${st.ghost}`} onClick={() => setToken('')}>Hide</button></div>
    </div> : null}
    <details className={h.instructions}>
      <summary>Set up Health Auto Export</summary>
      <p className={st.note}>Two REST API automations, same URL and token: JSON, export version 2, POST, headers <code>Content-Type: application/json</code> and <code>Authorization: Bearer …</code>.</p>
      <ol className={h.steps}>
        <li><strong>Daily activity</strong><p>Health Metrics: Active Energy, Apple Exercise Time, Step Count. Summarize Data on, Time Grouping Days, Date Range Default (yesterday and today). The exporter adds the day-grouping header itself; don’t add one.</p></li>
        <li><strong>Watch workouts</strong><p>Workouts, Include Workout Metrics with Time Grouping Minutes, routes off, Date Range Default.</p></li>
      </ol>
      <p className={st.note}>Run each once by hand and check the result here before scheduling. <a href="https://help.healthyapps.dev/en/health-auto-export/automations/rest-api/" target="_blank" rel="noreferrer">Exporter guide ↗</a></p>
    </details>
    <details className={h.instructions}>
      <summary>Import a JSON file</summary>
      <p className={st.note}>A JSON v2 export. Daily metrics need Summarize Data with Days grouping. Re-importing replaces matching records instead of adding to them.</p>
      <input ref={fileInput} className={s.input} type="file" accept=".json,application/json" disabled={!!busy} aria-label="Health Auto Export JSON file" onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); setResult(null); }} />
      {file ? <p className={st.note}>{file.name} · {(file.size / 1024).toFixed(0)} KB</p> : null}
      <button type="button" className={st.pill} style={{ marginTop: 8 }} disabled={!file || !!busy || pendingCount > 0} onClick={() => void upload()}>{busy === 'upload' ? 'Importing…' : 'Import file'}</button>
      {pendingCount ? <p className={st.note}>Waiting for your journal changes to sync first.</p> : null}
    </details>
    {result ? <ImportSummary result={result} /> : connection?.lastResult ? <details className={h.instructions}><summary>Last import result</summary><ImportSummary result={connection.lastResult} /></details> : null}
    {notice ? <p className={st.note} role="status">{notice}</p> : null}
    {error ? <p className={st.error} role="alert">{error}</p> : null}
  </section></>;
}
