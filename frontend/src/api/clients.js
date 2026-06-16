import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// ── Clients ───────────────────────────────────────────────────────────────────
export const getClients      = ()               => api.get('/clients/').then(r => r.data)
export const createClient    = (name)           => api.post('/clients/', { name }).then(r => r.data)
export const updateClient    = (id, name)       => api.put(`/clients/${id}`, { name }).then(r => r.data)
export const deleteClient    = (id)             => api.delete(`/clients/${id}`).then(r => r.data)
export const updateRecipients = (id, recipients) => api.put(`/clients/${id}/recipients`, { recipients }).then(r => r.data)
export const getEmailStatus  = ()               => api.get('/compare/email/status').then(r => r.data)

// ── Conditions ────────────────────────────────────────────────────────────────
export const getConditions   = (clientId)           => api.get(`/clients/${clientId}/conditions`).then(r => r.data)
export const createCondition = (clientId, body)     => api.post(`/clients/${clientId}/conditions`, body).then(r => r.data)
export const updateCondition = (clientId, condId, body) => api.put(`/clients/${clientId}/conditions/${condId}`, body).then(r => r.data)
export const deleteCondition = (clientId, condId)   => api.delete(`/clients/${clientId}/conditions/${condId}`).then(r => r.data)

// ── Runs ──────────────────────────────────────────────────────────────────────
export const runCondition = (payload) => api.post('/compare/run-condition', payload).then(r => r.data)
export const runAll       = (payload) => api.post('/compare/run-all',       payload).then(r => r.data)
export const runAllAndEmail = (payload) => api.post('/compare/run-all', { ...payload, email: true }).then(r => r.data)
export const downloadUrl  = (resultId) => `/api/compare/download/${resultId}`
