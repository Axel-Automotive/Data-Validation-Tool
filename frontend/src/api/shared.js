import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const getShared    = ()          => api.get('/shared-conditions/').then(r => r.data)
export const createShared = (body)      => api.post('/shared-conditions/', body).then(r => r.data)
export const updateShared = (id, body)  => api.put(`/shared-conditions/${id}`, body).then(r => r.data)
export const deleteShared = (id)        => api.delete(`/shared-conditions/${id}`).then(r => r.data)
