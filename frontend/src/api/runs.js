import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const getRuns = () => api.get('/runs/').then(r => r.data)
export const getTrends = () => api.get('/runs/trends').then(r => r.data)
