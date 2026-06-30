import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// ── Per-client AXEL DB connection ─────────────────────────────────────────────
export const getAxelConnection    = (clientId)       => api.get(`/clients/${clientId}/axel-connection`).then(r => r.data)
export const saveAxelConnection   = (clientId, body) => api.put(`/clients/${clientId}/axel-connection`, body).then(r => r.data)
export const deleteAxelConnection = (clientId)       => api.delete(`/clients/${clientId}/axel-connection`).then(r => r.data)
export const testAxelConnection   = (clientId)       => api.post(`/clients/${clientId}/axel-connection/test`).then(r => r.data)

// ── Per-client AXEL report queries ────────────────────────────────────────────
export const getAxelQueries   = (clientId)            => api.get(`/clients/${clientId}/axel-queries`).then(r => r.data)
export const createAxelQuery  = (clientId, body)      => api.post(`/clients/${clientId}/axel-queries`, body).then(r => r.data)
export const updateAxelQuery  = (clientId, qid, body) => api.put(`/clients/${clientId}/axel-queries/${qid}`, body).then(r => r.data)
export const deleteAxelQuery  = (clientId, qid)       => api.delete(`/clients/${clientId}/axel-queries/${qid}`).then(r => r.data)
// `params` is sent as the JSON body (the backend reads it as the params dict).
export const previewAxelQuery = (clientId, qid, params = {}) => api.post(`/clients/${clientId}/axel-queries/${qid}/preview`, params).then(r => r.data)
