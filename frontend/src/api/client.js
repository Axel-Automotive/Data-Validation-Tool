import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const uploadFile = async (file) => {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/files/upload', form)
  return data
}

export const getColumns = async (fileId, sheet) => {
  const { data } = await api.get(`/files/${fileId}/columns`, { params: { sheet } })
  return data
}

export const runSheetDiff = async (payload) => {
  const { data } = await api.post('/compare/sheet-diff', payload)
  return data
}

export const runStacked = async (payload) => {
  const { data } = await api.post('/compare/stacked', payload)
  return data
}

export const runCalcDiff = async (payload) => {
  const { data } = await api.post('/compare/calc-diff', payload)
  return data
}

export const downloadUrl = (resultId) => `/api/compare/download/${resultId}`
