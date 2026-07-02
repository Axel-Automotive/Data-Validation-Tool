import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const getBreaks = (clientId, { status, includeCleared } = {}) =>
  api.get('/breaks/', { params: { client_id: clientId, status, include_cleared: includeCleared } })
    .then(r => r.data)

export const updateBreak = (id, fields) =>
  api.patch(`/breaks/${id}`, fields).then(r => r.data)
