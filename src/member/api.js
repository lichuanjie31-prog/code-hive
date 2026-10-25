let csrfToken = ''

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  if (method !== 'GET' && !csrfToken) await initializeCsrf()
  const response = await fetch(path, {
    method, credentials: 'same-origin', signal,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof data?.detail === 'string' ? data.detail : Array.isArray(data?.detail) ? data.detail.map((item) => `${item.loc.slice(1).join('.')}: ${item.msg}`).join('；') : '服务暂时不可用，请稍后重试'
    throw new ApiError(message, response.status)
  }
  if (data?.csrf_token) csrfToken = data.csrf_token
  return data
}

export async function initializeCsrf() { return api('/api/auth/csrf') }
export function resetCsrf() { csrfToken = '' }
