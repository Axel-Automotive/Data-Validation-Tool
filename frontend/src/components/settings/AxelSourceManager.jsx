import { useState, useEffect } from 'react'
import { Database, Plug, Plus, Trash2, Edit2, Play, CheckCircle2, XCircle, Save } from 'lucide-react'
import {
  getAxelConnection, saveAxelConnection, testAxelConnection,
  getAxelQueries, createAxelQuery, updateAxelQuery, deleteAxelQuery, previewAxelQuery,
} from '../../api/axelSources'
import { toast } from '../../lib/toast'

const PARAM_TYPES = ['text', 'int', 'float', 'date']

const blankQuery = () => ({
  name: '', description: '', source_kind: 'db', db_mode: 'sql',
  sql: '', params: [], row_limit: 50000,
  api_method: 'GET', api_path: '', api_body: {}, api_json_path: '',
})

// ── Connection editor ─────────────────────────────────────────────────────────
function ConnectionEditor({ clientId }) {
  const [form, setForm] = useState({ kind: 'db', host: '', port: 1433, database: '', username: '', password: '',
                                     api_base: '', api_token: '', api_auth: 'bearer', api_auth_name: '' })
  const [hasPassword, setHasPassword] = useState(false)
  const [hasApiToken, setHasApiToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    getAxelConnection(clientId).then(c => {
      if (!c || !Object.keys(c).length) return
      setForm(f => ({ ...f, kind: c.kind || 'db', host: c.host || '', port: c.port || 1433,
        database: c.database || '', username: c.username || '', password: '',
        api_base: c.api_base || '', api_token: '', api_auth: c.api_auth || 'bearer', api_auth_name: c.api_auth_name || '' }))
      setHasPassword(!!c.has_password)
      setHasApiToken(!!c.has_api_token)
    }).catch(() => {})
  }, [clientId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const isApi = form.kind === 'api'

  const handleSave = async () => {
    setSaving(true); setTestResult(null)
    try {
      await saveAxelConnection(clientId, form)
      setHasPassword(hasPassword || !!form.password)
      setHasApiToken(hasApiToken || !!form.api_token)
      setForm(f => ({ ...f, password: '', api_token: '' }))
      toast('Connection saved', 'success')
    } catch (e) { toast(e.response?.data?.detail || 'Failed to save connection', 'error') }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try { setTestResult(await testAxelConnection(clientId)) }
    catch (e) { setTestResult({ ok: false, message: e.response?.data?.detail || 'Test failed' }) }
    finally { setTesting(false) }
  }

  const field = (label, key, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</label>
      <input type={type} value={form[key]} placeholder={placeholder}
        onChange={e => set(key, type === 'number' ? Number(e.target.value) : e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400" />
    </div>
  )

  const selectCls = "w-full appearance-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400"

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Plug size={14} className="text-slate-500" />
          <h4 className="text-sm font-bold text-slate-900">{isApi ? 'API connection' : 'SQL Server connection'}</h4>
        </div>
        <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
          <button type="button" onClick={() => set('kind', 'db')}
            className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-colors ${!isApi ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500 hover:text-slate-700'}`}>Database</button>
          <button type="button" onClick={() => set('kind', 'api')}
            className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-colors ${isApi ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500 hover:text-slate-700'}`}>API</button>
        </div>
      </div>

      {isApi ? (
        <>
          {field('Base URL', 'api_base', 'text', 'https://api.example.com')}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Auth type</label>
              <select value={form.api_auth} onChange={e => set('api_auth', e.target.value)} className={selectCls}>
                <option value="bearer">Bearer token</option>
                <option value="header">API key header</option>
                <option value="query">Query-param key</option>
                <option value="none">None</option>
              </select>
            </div>
            {(form.api_auth === 'header' || form.api_auth === 'query') &&
              field(form.api_auth === 'header' ? 'Header name' : 'Param name', 'api_auth_name', 'text',
                    form.api_auth === 'header' ? 'X-API-Key' : 'api_key')}
          </div>
          {form.api_auth !== 'none' &&
            field(hasApiToken ? 'Token / key (leave blank to keep current)' : 'Token / key', 'api_token', 'password', hasApiToken ? '••••••••' : '')}
          <p className="text-2xs text-slate-400">The token is encrypted at rest and never leaves the server.</p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {field('Host', 'host', 'text', 'sql.example.com')}
            {field('Port', 'port', 'number')}
            {field('Database', 'database')}
            {field('Username', 'username', 'text', 'read-only login')}
          </div>
          {field(hasPassword ? 'Password (leave blank to keep current)' : 'Password', 'password', 'password', hasPassword ? '••••••••' : '')}
          <p className="text-2xs text-slate-400">Use a <span className="font-medium">read-only</span> SQL login. Credentials are encrypted at rest and never leave the server.</p>
        </>
      )}
      <div className="flex items-center gap-2">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
          <Save size={13} /> {saving ? 'Saving…' : 'Save connection'}
        </button>
        <button onClick={handleTest} disabled={testing}
          className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {testResult && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${testResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
            {testResult.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {testResult.message}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Query editor ────────────────────────────────────────────────────────────
function QueryEditor({ clientId, initial, onSaved, onCancel }) {
  const [q, setQ] = useState(initial ? { ...blankQuery(), ...initial } : blankQuery())
  const [bodyText, setBodyText] = useState(JSON.stringify(initial?.api_body || {}, null, 2))
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState(null)

  const isApi = q.source_kind === 'api'
  const isPost = (q.api_method || 'GET').toUpperCase() === 'POST'
  const set = (k, v) => setQ(p => ({ ...p, [k]: v }))
  const setParam = (i, k, v) => setQ(p => ({ ...p, params: p.params.map((pr, j) => j === i ? { ...pr, [k]: v } : pr) }))
  const addParam = () => setQ(p => ({ ...p, params: [...p.params, { name: '', type: 'text', required: false, default: '', label: '' }] }))
  const delParam = (i) => setQ(p => ({ ...p, params: p.params.filter((_, j) => j !== i) }))

  const handleSave = async () => {
    if (!q.name.trim()) { toast('Give the query a name', 'error'); return }
    let payload = q
    if (isApi && isPost) {
      try { payload = { ...q, api_body: bodyText.trim() ? JSON.parse(bodyText) : {} } }
      catch { toast('Request body is not valid JSON', 'error'); return }
    }
    setSaving(true)
    try {
      const saved = initial?.id
        ? await updateAxelQuery(clientId, initial.id, payload)
        : await createAxelQuery(clientId, payload)
      toast(initial?.id ? 'Query updated' : 'Query created', 'success')
      onSaved(saved)
    } catch (e) { toast(e.response?.data?.detail || 'Failed to save query (for DB, the SQL must be a single SELECT)', 'error') }
    finally { setSaving(false) }
  }

  const handlePreview = async () => {
    if (!initial?.id) { toast('Save the query first, then preview', 'error'); return }
    setPreviewing(true); setPreview(null)
    try {
      const seed = {}
      q.params.forEach(p => { seed[p.name] = p.default ?? '' })
      setPreview(await previewAxelQuery(clientId, initial.id, seed))
    } catch (e) { toast(e.response?.data?.detail || 'Preview failed', 'error') }
    finally { setPreviewing(false) }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400">Source kind</label>
        <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
          <button type="button" onClick={() => set('source_kind', 'db')}
            className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-colors ${!isApi ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500 hover:text-slate-700'}`}>Database (SQL)</button>
          <button type="button" onClick={() => set('source_kind', 'api')}
            className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-colors ${isApi ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500 hover:text-slate-700'}`}>API</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Query / report name</label>
          <input value={q.name} onChange={e => set('name', e.target.value)} placeholder="Daily Sales Report"
            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400" />
        </div>
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Row limit</label>
          <input type="number" value={q.row_limit} onChange={e => set('row_limit', Number(e.target.value))}
            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400" />
        </div>
      </div>

      {isApi ? (
        <div className="space-y-3">
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <div>
              <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Method</label>
              <select value={q.api_method} onChange={e => set('api_method', e.target.value)}
                className="w-full appearance-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
            <div>
              <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Path (relative to base URL — use :name for params)</label>
              <input value={q.api_path} onChange={e => set('api_path', e.target.value)} spellCheck={false}
                placeholder="/reports/daily-sales?from=:from_date"
                className="w-full font-mono text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400" />
            </div>
          </div>
          <div>
            <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">JSON path to rows (e.g. data.rows — blank if the response is already an array)</label>
            <input value={q.api_json_path} onChange={e => set('api_json_path', e.target.value)} spellCheck={false} placeholder="data.rows"
              className="w-full font-mono text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400" />
          </div>
          {isPost && (
            <div>
              <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Request body (JSON — use ":name" for params)</label>
              <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={4} spellCheck={false}
                placeholder={'{\n  "store": ":store_id"\n}'}
                className="w-full font-mono text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400" />
            </div>
          )}
        </div>
      ) : (
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-400 mb-1">SQL (read-only SELECT — use :name for parameters)</label>
          <textarea value={q.sql} onChange={e => set('sql', e.target.value)} rows={5} spellCheck={false}
            placeholder={'SELECT id, total\nFROM dbo.Orders\nWHERE sale_date >= :from_date'}
            className="w-full font-mono text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400" />
        </div>
      )}

      {/* Params */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-2xs font-semibold uppercase tracking-wider text-slate-400">Parameters (optional)</label>
          <button onClick={addParam} className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-700 hover:text-brand-800"><Plus size={11} /> Add</button>
        </div>
        {q.params.length > 0 && (
          <div className="space-y-2">
            {q.params.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={p.name} onChange={e => setParam(i, 'name', e.target.value)} placeholder="name"
                  className="w-32 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-100" />
                <select value={p.type} onChange={e => setParam(i, 'type', e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none">
                  {PARAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input value={p.default ?? ''} onChange={e => setParam(i, 'default', e.target.value)} placeholder="default"
                  className="w-28 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-100" />
                <label className="inline-flex items-center gap-1 text-2xs text-slate-500">
                  <input type="checkbox" checked={p.required} onChange={e => setParam(i, 'required', e.target.checked)} /> required
                </label>
                <button onClick={() => delParam(i)} className="text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
          <Save size={13} /> {saving ? 'Saving…' : 'Save query'}
        </button>
        <button onClick={handlePreview} disabled={previewing || !initial?.id} title={initial?.id ? '' : 'Save first to preview'}
          className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
          <Play size={12} /> {previewing ? 'Running…' : 'Preview'}
        </button>
        <button onClick={onCancel} className="text-xs font-medium text-slate-500 hover:text-slate-700 ml-1">Cancel</button>
      </div>

      {preview && (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-2xs font-semibold text-slate-500 mb-1">{preview.rows} sample row(s) · {preview.cols} columns</p>
          <p className="text-xs text-slate-600 break-words"><span className="font-medium">Columns:</span> {preview.columns.join(', ')}</p>
        </div>
      )}
    </div>
  )
}

// ── Manager (connection + query list) ─────────────────────────────────────────
export default function AxelSourceManager({ clientId }) {
  const [queries, setQueries] = useState([])
  const [editing, setEditing] = useState(null)   // query | {} (new) | null
  const [confirmDel, setConfirmDel] = useState(null)

  const refresh = () => getAxelQueries(clientId).then(q => setQueries(Array.isArray(q) ? q : [])).catch(() => {})
  useEffect(() => { refresh() }, [clientId])

  const handleDelete = async (id) => {
    try { await deleteAxelQuery(clientId, id); setConfirmDel(null); refresh(); toast('Query deleted', 'success') }
    catch { toast('Failed to delete', 'error') }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Database size={15} className="text-slate-500" />
        <h3 className="text-sm font-bold text-slate-900">AXEL Data Source</h3>
        <span className="text-2xs text-slate-400">— pull the AXEL side live from this client's database (optional; .xlsx still works)</span>
      </div>

      <ConnectionEditor clientId={clientId} />

      {/* Queries */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-400">Report queries</p>
          {!editing && (
            <button onClick={() => setEditing({})}
              className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-lg hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors">
              <Plus size={12} /> Add query
            </button>
          )}
        </div>

        {editing && (
          <QueryEditor
            key={editing.id || 'new'}
            clientId={clientId}
            initial={editing.id ? editing : null}
            onSaved={() => { setEditing(null); refresh() }}
            onCancel={() => setEditing(null)} />
        )}

        {!editing && queries.length === 0 && (
          <p className="text-xs text-slate-400 py-2">No queries yet. Add one to use a DB report as the AXEL side.</p>
        )}

        {queries.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            {queries.map((q, i) => (
              <div key={q.id} className={i > 0 ? 'border-t border-slate-100' : ''}>
                <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{q.name}</p>
                    <p className="text-2xs text-slate-400">{(q.params || []).length} param(s) · limit {q.row_limit?.toLocaleString?.() || q.row_limit}</p>
                  </div>
                  <button onClick={() => setEditing(q)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><Edit2 size={13} /></button>
                  <button onClick={() => setConfirmDel(confirmDel === q.id ? null : q.id)}
                    className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${confirmDel === q.id ? 'bg-red-50 text-red-500' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}><Trash2 size={13} /></button>
                </div>
                {confirmDel === q.id && (
                  <div className="flex items-center gap-3 px-4 pb-3">
                    <p className="text-xs text-slate-500 flex-1">Delete "{q.name}"?</p>
                    <button onClick={() => handleDelete(q.id)} className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded-md transition-colors">Delete</button>
                    <button onClick={() => setConfirmDel(null)} className="text-xs font-medium text-slate-600 hover:text-slate-800">Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
