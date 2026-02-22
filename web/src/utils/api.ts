const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? ''

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '')

export const apiUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath
}

export const apiFetch = (path: string, init?: RequestInit) => {
  return fetch(apiUrl(path), init)
}
