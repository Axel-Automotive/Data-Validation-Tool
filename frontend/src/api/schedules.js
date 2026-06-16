import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const getSchedules   = ()          => api.get('/schedules/').then(r => r.data)
export const createSchedule = (body)      => api.post('/schedules/', body).then(r => r.data)
export const updateSchedule = (id, body)  => api.put(`/schedules/${id}`, body).then(r => r.data)
export const deleteSchedule = (id)        => api.delete(`/schedules/${id}`).then(r => r.data)
export const runScheduleNow = (id)        => api.post(`/schedules/${id}/run`).then(r => r.data)

// Persisted files available to pin to a schedule
export const listFiles      = ()          => api.get('/files/').then(r => r.data)
