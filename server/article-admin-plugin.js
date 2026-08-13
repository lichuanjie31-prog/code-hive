import { ArticleStoreError, createArticleStore } from './article-store.js'

const apiPrefix = '/api/admin/articles'
const maxRequestBytes = 7 * 1024 * 1024
const loopbackAddresses = new Set(['127.0.0.1', '::1'])

function sendJson(response, status, body) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function sendError(response, status, code, message) {
  sendJson(response, status, { error: { code, message } })
}

function isLoopback(address) {
  return loopbackAddresses.has(address) || /^::ffff:127\.0\.0\.1$/i.test(address ?? '')
}

function isSameOrigin(request) {
  const origin = request.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === request.headers.host
  } catch {
    return false
  }
}

async function readJson(request) {
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxRequestBytes) {
      request.resume()
      throw new ArticleStoreError(413, 'REQUEST_TOO_LARGE', 'Request body exceeds the 7 MiB limit.')
    }
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ArticleStoreError(400, 'INVALID_JSON', 'Request body must be valid JSON.')
  }
}

function route(pathname) {
  if (pathname === apiPrefix) return { type: 'collection' }
  const image = new RegExp(`^${apiPrefix}/([a-z0-9]+(?:-[a-z0-9]+)*)/images$`).exec(pathname)
  if (image) return { type: 'images', slug: image[1] }
  const article = new RegExp(`^${apiPrefix}/([a-z0-9]+(?:-[a-z0-9]+)*)$`).exec(pathname)
  if (article) return { type: 'article', slug: article[1] }
  return null
}

async function handle(request, response, store) {
  const { pathname } = new URL(request.url, 'http://localhost')
  if (!pathname.startsWith('/api/admin/')) return false
  if (!isLoopback(request.socket?.remoteAddress)) {
    sendError(response, 403, 'REMOTE_FORBIDDEN', 'The article admin API only accepts loopback requests.')
    return true
  }
  if (!isSameOrigin(request)) {
    sendError(response, 403, 'ORIGIN_FORBIDDEN', 'The request origin must match the local development server.')
    return true
  }
  const matchedRoute = route(pathname)
  if (!matchedRoute) {
    sendError(response, 404, 'NOT_FOUND', 'API endpoint was not found.')
    return true
  }
  try {
    let data
    if (matchedRoute.type === 'collection' && request.method === 'GET') {
      data = await store.list()
    } else if (matchedRoute.type === 'article' && request.method === 'GET') {
      data = await store.get(matchedRoute.slug)
    } else if (matchedRoute.type === 'collection' && request.method === 'POST') {
      const body = await readJson(request)
      data = await store.save({ originalSlug: null, article: body.article, body: body.body })
    } else if (matchedRoute.type === 'article' && request.method === 'PUT') {
      const body = await readJson(request)
      data = await store.save({ originalSlug: matchedRoute.slug, article: body.article, body: body.body })
    } else if (matchedRoute.type === 'images' && request.method === 'POST') {
      data = await store.upload({ slug: matchedRoute.slug, ...await readJson(request) })
    } else if (matchedRoute.type === 'article' && request.method === 'DELETE') {
      const body = await readJson(request)
      await store.remove({ slug: matchedRoute.slug, confirmed: body.confirmed })
      data = { slug: matchedRoute.slug, deleted: true }
    } else {
      sendError(response, 404, 'NOT_FOUND', 'API endpoint was not found.')
      return true
    }
    sendJson(response, 200, { data })
  } catch (error) {
    if (error instanceof ArticleStoreError) {
      sendError(response, error.status, error.code, error.message)
    } else {
      sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred.')
    }
  }
  return true
}

export function articleAdminPlugin({ rootDir, mode }) {
  if (mode !== 'development') return undefined
  const store = createArticleStore({ rootDir })
  return {
    name: 'article-admin-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        handle(request, response, store).then((handled) => {
          if (!handled) next()
        }).catch(next)
      })
    },
  }
}
