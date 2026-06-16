import { useState } from 'react'
import { Mail, X, Plus, Save, Send } from 'lucide-react'
import { sendTestEmail } from '../../api/clients'
import { toast } from '../../lib/toast'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function RecipientsEditor({ recipients, subject = '', clientName = '', onSave }) {
  const [list,    setList]    = useState(recipients)
  const [subj,    setSubj]    = useState(subject)
  const [draft,   setDraft]   = useState('')
  const [error,   setError]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [testTo,  setTestTo]  = useState('')
  const [testing, setTesting] = useState(false)

  const sendTest = async () => {
    const to = (testTo || list[0] || '').trim()
    if (!EMAIL_RE.test(to)) { toast('Enter a valid test address', 'error'); return }
    setTesting(true)
    try { await sendTestEmail(to); toast(`Test email sent to ${to}`, 'success') }
    catch (e) { toast(e.response?.data?.detail || 'Test email failed', 'error') }
    finally { setTesting(false) }
  }

  const dirty = JSON.stringify(list) !== JSON.stringify(recipients) || subj !== subject

  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (!EMAIL_RE.test(v)) { setError('Enter a valid email address'); return }
    if (list.some(r => r.toLowerCase() === v.toLowerCase())) { setError('Already added'); return }
    setList([...list, v]); setDraft(''); setError('')
  }

  const remove = (i) => setList(list.filter((_, j) => j !== i))

  const save = async () => {
    setSaving(true)
    try { await onSave({ recipients: list, subject: subj.trim() }) } finally { setSaving(false) }
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-100 bg-slate-50">
        <Mail size={15} className="text-slate-400" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">Email Report Settings</p>
          <p className="text-xs text-slate-400">Used by "Run All &amp; Email" and schedules</p>
        </div>
        {dirty && (
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
            {saving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={13} />}
            Save
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Subject */}
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Email Subject</label>
          <input
            value={subj}
            onChange={e => setSubj(e.target.value)}
            placeholder={`Validation Report — ${clientName || 'Client'}`}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors" />
          <p className="text-xs text-slate-400 mt-1">Leave blank to use the default shown above.</p>
        </div>

        {/* Recipients */}
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Recipients</label>
          {list.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-2.5">
              {list.map((r, i) => (
                <span key={r} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs font-medium pl-3 pr-1.5 py-1.5 rounded-full">
                  {r}
                  <button onClick={() => remove(i)}
                    className="w-4 h-4 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-white transition-colors">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 mb-2.5">No recipients yet — add one below.</p>
          )}

          <div className="flex gap-2">
            <input
              value={draft}
              onChange={e => { setDraft(e.target.value); if (error) setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              placeholder="name@dealer.com"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors" />
            <button onClick={add}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
              <Plus size={14} /> Add
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
        </div>

        {/* Test email */}
        <div className="pt-4 border-t border-slate-100">
          <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Send a test email</label>
          <div className="flex gap-2">
            <input
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              placeholder={list[0] || 'you@axelautomotive.com'}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors" />
            <button onClick={sendTest} disabled={testing}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              {testing ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <Send size={13} />}
              Send test
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Verifies SMTP is configured. Defaults to the first recipient if left blank.</p>
        </div>
      </div>
    </div>
  )
}
