import { useEffect, useRef, useState } from 'react';
import { Check, Cloud, Link2, LoaderCircle, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { createGoogleSheet, createRow, deleteRow, getSheet, getWebSocketUrl, normalizeSnapshot, openGooglePicker, selectGoogleSheet, startGoogleConnect, updateRow } from './api.js';

const fallbackRows = [
  { rowNumber: 1, values: ['Apple', '12', 'Fruit'] },
  { rowNumber: 2, values: ['Carrot', '40', 'Vegetable'] },
  { rowNumber: 3, values: ['Almond', '8', 'Nut'] },
  { rowNumber: 4, values: ['Basil', '15', 'Herb'] },
];
const fallbackSnapshot = { mode: 'demo', sheetId: 'demo-sheet-001', sheetName: 'Bajaj Earths Demo', rows: fallbackRows, updatedAt: new Date().toISOString() };

function App() {
  const [mode, setMode] = useState('demo');
  const [snapshot, setSnapshot] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [editingRow, setEditingRow] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(null);
  const [isDeleting, setIsDeleting] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSynced, setLastSynced] = useState(new Date());
  const [notice, setNotice] = useState(null);
  const [showGoogleChoice, setShowGoogleChoice] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    getSheet(mode).then((next) => {
      if (!active) return;
      setSnapshot(next); setLastSynced(new Date(next.updatedAt)); setIsConnected(mode === 'personal');
    }).catch((error) => {
      if (!active) return;
      if (mode === 'demo') setSnapshot(fallbackSnapshot);
      setNotice({ message: error instanceof Error ? `Sync unavailable: ${error.message}` : 'Sync unavailable', kind: 'error' });
    }).finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'connected') {
      setShowGoogleChoice(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer;

    const connect = () => {
      if (disposed) return;
      const socket = new WebSocket(getWebSocketUrl(mode));
      socketRef.current = socket;
      socket.onmessage = (event) => {
        const next = normalizeSnapshot(JSON.parse(event.data)); setSnapshot(next); setLastSynced(new Date(next.updatedAt)); setNotice({ message: 'Updated from Google Sheet', kind: 'success' });
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (disposed) return;
        setNotice({ message: 'Reconnecting to live updates...', kind: 'error' });
        reconnectTimer = window.setTimeout(connect, 2000);
      };
    };

    socketRef.current?.close();
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, [mode]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const updateDraft = (row, column, value) => {
    const current = drafts[row.rowNumber] ?? row.values;
    const next = [...current]; next[column] = value;
    setDrafts({ ...drafts, [row.rowNumber]: next });
  };
  const saveRow = async (row) => {
    const values = drafts[row.rowNumber] ?? row.values; setIsSaving(row.rowNumber);
    try { const next = await updateRow(mode, row.rowNumber, values); setSnapshot(next); setEditingRow(null); setDrafts({ ...drafts, [row.rowNumber]: values }); setLastSynced(new Date(next.updatedAt)); setNotice({ message: 'Row submitted to Google Sheet', kind: 'success' }); }
    catch (error) { setNotice({ message: error instanceof Error ? error.message : 'Unable to save row', kind: 'error' }); }
    finally { setIsSaving(null); }
  };
  const addRow = async () => {
    setIsAdding(true);
    try {
      const next = await createRow(mode, ['', '', '']);
      const existingRows = next.rows ?? [];
      const rowNumber = existingRows.reduce((highest, row) => Math.max(highest, row.rowNumber), 0) + 1;
      const hasBlankRow = existingRows.some((row) => row.rowNumber === rowNumber);
      setSnapshot(hasBlankRow ? next : { ...next, rows: [...existingRows, { rowNumber, values: ['', '', ''] }] });
      setEditingRow(hasBlankRow ? null : rowNumber);
      if (!hasBlankRow) setDrafts({ ...drafts, [rowNumber]: ['', '', ''] });
      setNotice({ message: 'New row added', kind: 'success' });
    }
    catch (error) { setNotice({ message: error instanceof Error ? error.message : 'Unable to add row', kind: 'error' }); }
    finally { setIsAdding(false); }
  };
  const removeRow = async (row) => {
    if (!window.confirm(`Delete row ${row.rowNumber}? This will remove it from Google Sheets.`)) return;
    setIsDeleting(row.rowNumber);
    try {
      const next = await deleteRow(mode, row.rowNumber);
      setSnapshot(next);
      setDrafts({});
      setEditingRow(null);
      setLastSynced(new Date(next.updatedAt));
      setNotice({ message: 'Row deleted from Google Sheet', kind: 'success' });
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : 'Unable to delete row', kind: 'error' });
    } finally { setIsDeleting(null); }
  };
  const handleMode = (nextMode) => { if (nextMode === 'personal' && !isConnected) { startGoogleConnect(); return; } setMode(nextMode); };
  const handleCreatePersonalSheet = async () => {
    try { const next = await createGoogleSheet(); setSnapshot(next); setMode('personal'); setIsConnected(true); setShowGoogleChoice(false); setNotice({ message: 'Personal Google Sheet created', kind: 'success' }); }
    catch (error) { setNotice({ message: error instanceof Error ? error.message : 'Unable to create personal sheet', kind: 'error' }); }
  };
  const handlePickPersonalSheet = async () => {
    try {
      await openGooglePicker(async (spreadsheetId) => {
        const next = await selectGoogleSheet(spreadsheetId);
        setSnapshot(next); setMode('personal'); setIsConnected(true); setShowGoogleChoice(false); setNotice({ message: 'Personal Google Sheet connected', kind: 'success' });
      });
    } catch (error) { setNotice({ message: error instanceof Error ? error.message : 'Unable to open Google Picker', kind: 'error' }); }
  };
  const relativeSync = Math.max(0, Math.round((Date.now() - lastSynced.getTime()) / 1000));
  const viewSnapshot = snapshot ?? { sheetName: 'Connecting to Google Sheet', sheetId: '', rows: [] };

  return <main className="paper-grid min-h-screen overflow-hidden"><div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
    <header className="fade-up flex flex-wrap items-start justify-between gap-6 border-b border-line pb-7"><div><div className="mb-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.22em] text-gold"><span className="h-2 w-2 rounded-full bg-gold" /> Bajaj Earths / Technical Task</div><h1 className="text-3xl font-extrabold tracking-[-0.06em] text-ink sm:text-4xl">Sheets <span className="font-normal text-gold">↔</span> Web Sync</h1><p className="mt-2 max-w-lg text-sm leading-6 text-stone-600">A live, two-way workspace for the sheet that never needs a refresh.</p></div><div className="flex items-center gap-3 rounded-full border border-line bg-white/65 px-4 py-2.5 text-xs text-stone-600 shadow-sm"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-moss opacity-30" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-moss" /></span><span className="font-semibold text-ink">Live</span> · synced {relativeSync}s ago</div></header>
    <section className="fade-up-delay mt-8"><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-xl border border-line bg-white/60 p-1"><ModeButton active={mode === 'demo'} onClick={() => handleMode('demo')}>Demo sheet</ModeButton><ModeButton active={mode === 'personal'} onClick={() => handleMode('personal')}>My sheet</ModeButton></div><button onClick={startGoogleConnect} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-gold px-4 py-2.5 text-xs font-bold text-gold transition hover:bg-gold hover:text-white"><Link2 size={14} /> Connect with Google</button></div></section>
    <section className="fade-up-delay mt-6 overflow-hidden rounded-2xl border border-line bg-white/85 shadow-[0_18px_60px_rgba(72,58,32,0.08)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-warm/40 px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white"><Cloud size={17} /></div><div><h2 className="text-sm font-extrabold text-ink">{viewSnapshot.sheetName}</h2><p className="font-mono text-[10px] text-stone-500">{viewSnapshot.sheetId}</p></div></div><div className="flex items-center gap-2 text-xs text-stone-500"><RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /> Polling every 3 seconds</div></div><div className="overflow-x-auto"><table className="w-full min-w-170 border-collapse text-left"><thead><tr className="border-b border-line bg-[#faf8f3] text-[10px] font-extrabold uppercase tracking-[0.18em] text-stone-500"><th className="w-1/4 px-6 py-4">Column A</th><th className="w-1/4 px-6 py-4">Column B</th><th className="w-1/4 px-6 py-4">Column C</th><th className="w-45 px-6 py-4 text-right">Action</th></tr></thead><tbody>{viewSnapshot.rows.map((row) => <SheetRow key={row.rowNumber} row={row} isEditing={editingRow === row.rowNumber} values={drafts[row.rowNumber] ?? row.values} isSaving={isSaving === row.rowNumber} isDeleting={isDeleting === row.rowNumber} onEdit={() => { setEditingRow(row.rowNumber); setDrafts({ ...drafts, [row.rowNumber]: row.values }); }} onCancel={() => setEditingRow(null)} onChange={(column, value) => updateDraft(row, column, value)} onSave={() => saveRow(row)} onDelete={() => removeRow(row)} />)}</tbody></table></div><div className="flex items-center justify-between border-t border-line px-5 py-4 sm:px-6"><span className="font-mono text-[11px] text-stone-500">{viewSnapshot.rows.length} rows · {mode === 'demo' ? 'shared demo' : 'private session'}</span><button onClick={addRow} disabled={isAdding} className="inline-flex items-center gap-2 rounded-lg bg-gold px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#8e6427] disabled:opacity-60">{isAdding ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />} Add row</button></div></section>
    <section className="mt-7 grid gap-5 border-l-2 border-gold pl-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><h3 className="text-sm font-extrabold text-ink">Your sheet, in step.</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-stone-600">Edits submitted here are written to Google Sheets immediately. Changes made directly in the sheet are detected and arrive here over the live connection in a few seconds.</p></div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-moss"><Check size={14} /> no refresh required</div></section>
  </div>{showGoogleChoice && <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-5"><div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-2xl"><div className="mb-1 text-lg font-extrabold text-ink">Choose your Google Sheet</div><p className="mb-6 text-sm leading-6 text-stone-600">Your Google account is connected. Choose an existing spreadsheet or create a new private one.</p><div className="grid gap-3"><button onClick={handlePickPersonalSheet} className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white"><Cloud size={16} /> Choose existing sheet</button><button onClick={handleCreatePersonalSheet} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-bold text-white"><Plus size={16} /> Create new sheet</button><button onClick={() => setShowGoogleChoice(false)} className="rounded-xl border border-line px-4 py-3 text-sm font-bold text-stone-500">Cancel</button></div></div></div>}{notice && <div className={`fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-3 text-xs font-bold text-white shadow-lg ${notice.kind === 'error' ? 'bg-rust' : 'bg-ink'}`}>{notice.kind === 'success' ? <Check size={14} /> : <X size={14} />} {notice.message}</div>}</main>;
}

function ModeButton({ active, onClick, children }) { return <button onClick={onClick} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${active ? 'bg-ink text-white shadow-sm' : 'text-stone-500 hover:text-ink'}`}>{children}</button>; }
function SheetRow({ row, values, isEditing, isSaving, isDeleting, onEdit, onCancel, onChange, onSave, onDelete }) { return <tr className="border-b border-line/70 last:border-0 hover:bg-[#faf8f3]/70"><td className="px-6 py-4">{isEditing ? <CellInput value={values[0]} onChange={(value) => onChange(0, value)} /> : <span className="text-sm font-semibold text-ink">{values[0] || <span className="text-stone-400">Empty</span>}</span>}</td><td className="px-6 py-4">{isEditing ? <CellInput value={values[1]} onChange={(value) => onChange(1, value)} /> : <span className="font-mono text-sm text-stone-600">{values[1] || <span className="text-stone-400">Empty</span>}</span>}</td><td className="px-6 py-4">{isEditing ? <CellInput value={values[2]} onChange={(value) => onChange(2, value)} /> : <span className="text-sm text-stone-600">{values[2] || <span className="text-stone-400">Empty</span>}</span>}</td><td className="px-6 py-4 text-right">{isEditing ? <div className="flex justify-end gap-2"><button onClick={onCancel} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-stone-500 hover:bg-warm">Cancel</button><button onClick={onSave} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{isSaving ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />} Submit</button></div> : <div className="flex justify-end gap-2"><button onClick={onEdit} className="rounded-lg border border-line px-3.5 py-2 text-xs font-bold text-ink transition hover:border-ink hover:bg-warm">Edit</button><button onClick={onDelete} disabled={isDeleting} aria-label={`Delete row ${row.rowNumber}`} className="inline-flex items-center justify-center rounded-lg border border-rust/30 px-3 py-2 text-rust transition hover:bg-rust hover:text-white disabled:opacity-60">{isDeleting ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button></div>}</td></tr>; }
function CellInput({ value, onChange }) { return <input autoFocus className="w-full rounded-lg border border-gold/70 bg-paper px-3 py-2 text-sm text-ink outline-none ring-gold/20 focus:ring-4" value={value} onChange={(event) => onChange(event.target.value)} />; }
export default App;
