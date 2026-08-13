const apiPrefix = '/api/admin/articles'
const maxUploadBytes = 5 * 1024 * 1024
const supportedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

export class AdminApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
  }
}

function apiUrl(...parts) {
  return [apiPrefix, ...parts.map((part) => encodeURIComponent(part))].join('/')
}

async function request(fetchImpl, url, { method = 'GET', body } = {}) {
  const response = await fetchImpl(url, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })
  const payload = await response.json()
  if (!response.ok) {
    const error = payload?.error ?? {}
    throw new AdminApiError(
      response.status,
      error.code ?? 'REQUEST_FAILED',
      error.message ?? `Request failed with status ${response.status}.`,
    )
  }
  return payload.data
}

function base64FromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1])
    reader.onerror = () => reject(reader.error ?? new Error('The selected file could not be read.'))
    reader.readAsDataURL(file)
  })
}

export async function fileToUploadPayload(file, kind) {
  if (!supportedMimeTypes.has(file?.type)) {
    throw new TypeError('Only PNG, JPEG, WebP, and SVG images are allowed.')
  }
  if (file.size > maxUploadBytes) {
    throw new RangeError('Upload exceeds the 5 MiB limit.')
  }
  return {
    kind,
    fileName: file.name,
    mimeType: file.type,
    base64: await base64FromFile(file),
  }
}

export function createAdminApi(fetchImpl = globalThis.fetch) {
  return {
    listArticles() {
      return request(fetchImpl, apiPrefix)
    },
    getArticle(slug) {
      return request(fetchImpl, apiUrl(slug))
    },
    saveArticle(originalSlug, payload) {
      return request(fetchImpl, originalSlug ? apiUrl(originalSlug) : apiPrefix, {
        method: originalSlug ? 'PUT' : 'POST',
        body: payload,
      })
    },
    async uploadImage(slug, file, kind) {
      return request(fetchImpl, apiUrl(slug, 'images'), {
        method: 'POST',
        body: await fileToUploadPayload(file, kind),
      })
    },
    deleteArticle(slug) {
      return request(fetchImpl, apiUrl(slug), {
        method: 'DELETE',
        body: { confirmed: true },
      })
    },
  }
}
