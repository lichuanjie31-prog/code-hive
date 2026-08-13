import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import { articleAdminPlugin } from '../server/article-admin-plugin.js'

const validBody = `${'\u6c49'.repeat(500)}\n\n![diagram](/articles/new-post/diagram.png)`
const validArticle = {
  slug: 'new-post',
  title: 'New post',
  summary: 'Used by the local article admin API test.',
  date: '2026-08-14',
  author: 'code-hive editors',
  cover: '/articles/shared-cover.svg',
  markdownPath: 'src/content/articles/new-post.md',
}
const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9BwAAAABJRU5ErkJggg=='

async function createProject() {
  const rootDir = await mkdtemp(join(tmpdir(), 'article-admin-plugin-'))
  await mkdir(join(rootDir, 'src/content/articles'), { recursive: true })
  await mkdir(join(rootDir, 'src/data'), { recursive: true })
  await mkdir(join(rootDir, 'public/articles'), { recursive: true })
  await writeFile(join(rootDir, 'src/content/articles/first-post.md'), validBody)
  await writeFile(join(rootDir, 'public/articles/shared-cover.svg'), '<svg/>')
  await writeFile(join(rootDir, 'src/data/articles.js'), `export const articles = [
  { slug: 'first-post', title: 'First post', summary: 'A fixture article.', date: '2026-08-13', author: 'code-hive editors', cover: '/articles/shared-cover.svg', markdownPath: 'src/content/articles/first-post.md' },
]

export function articleSlugFromHash(hash) { return /^#\\/articles\\//.test(hash) ? hash.slice(11) : null }
export function findArticleBySlug(slug) { return articles.find((article) => article.slug === slug) ?? null }
`)
  return rootDir
}

async function startApi(rootDir) {
  const plugin = articleAdminPlugin({ rootDir, mode: 'development' })
  let middleware
  plugin.configureServer({
    middlewares: {
      use(handler) {
        middleware = handler
      },
    },
  })
  const server = createServer((request, response) => middleware(request, response, () => {
    response.statusCode = 404
    response.end()
  }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    },
    request(path, { method = 'GET', body, origin } = {}) {
      return new Promise((resolve, reject) => {
        const headers = {}
        if (origin) headers.origin = origin
        if (body !== undefined) {
          headers['content-type'] = 'application/json'
          headers['content-length'] = Buffer.byteLength(body)
        }
        const request = globalThis.fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body })
        request.then(async (response) => resolve({ status: response.status, body: await response.json() })).catch(reject)
      })
    },
    middleware,
  }
}

async function withApi(run) {
  const rootDir = await createProject()
  const api = await startApi(rootDir)
  try {
    await run(api)
  } finally {
    await api.close()
    await rm(rootDir, { recursive: true, force: true })
  }
}

function invokeMiddleware(middleware, { remoteAddress, method = 'POST', url = '/api/admin/articles', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      setHeader() {},
      end(chunk = '') {
        try {
          resolve({ status: this.statusCode, body: JSON.parse(chunk) })
        } catch (error) {
          reject(error)
        }
      },
    }
    const request = new Readable({ read() {} })
    request.method = method
    request.url = url
    request.headers = headers
    request.socket = { remoteAddress }
    process.nextTick(() => request.emit('end'))
    middleware(request, response, reject)
  })
}

test('GET list and detail return store data through real HTTP middleware', async () => {
  await withApi(async (api) => {
    const list = await api.request('/api/admin/articles')
    assert.equal(list.status, 200)
    assert.deepEqual(list.body.data.map((article) => article.slug), ['first-post'])
    const detail = await api.request('/api/admin/articles/first-post')
    assert.equal(detail.status, 200)
    assert.equal(detail.body.data.body, validBody)
  })
})

test('POST and PUT persist article changes through real HTTP middleware', async () => {
  await withApi(async (api) => {
    const created = await api.request('/api/admin/articles', { method: 'POST', body: JSON.stringify({ article: validArticle, body: validBody }) })
    assert.equal(created.status, 200)
    assert.equal(created.body.data.slug, 'new-post')
    const updatedArticle = { ...validArticle, title: 'Updated post' }
    const updated = await api.request('/api/admin/articles/new-post', { method: 'PUT', body: JSON.stringify({ article: updatedArticle, body: validBody }) })
    assert.equal(updated.status, 200)
    assert.equal((await api.request('/api/admin/articles/new-post')).body.data.title, 'Updated post')
  })
})

test('image upload returns the public asset URL', async () => {
  await withApi(async (api) => {
    const uploaded = await api.request('/api/admin/articles/first-post/images', {
      method: 'POST',
      body: JSON.stringify({ kind: 'image', fileName: 'diagram.png', mimeType: 'image/png', base64: tinyPngBase64 }),
    })
    assert.equal(uploaded.status, 200)
    assert.equal(uploaded.body.data.url, '/articles/first-post/diagram.png')
  })
})

test('DELETE removes a confirmed article and returns confirmation', async () => {
  await withApi(async (api) => {
    const removed = await api.request('/api/admin/articles/first-post', { method: 'DELETE', body: JSON.stringify({ confirmed: true }) })
    assert.equal(removed.status, 200)
    assert.deepEqual(removed.body.data, { slug: 'first-post', deleted: true })
    assert.equal((await api.request('/api/admin/articles/first-post')).status, 404)
  })
})

test('unknown articles and routes return JSON 404 errors', async () => {
  await withApi(async (api) => {
    const missing = await api.request('/api/admin/articles/missing')
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'ARTICLE_NOT_FOUND')
    const route = await api.request('/api/admin/unknown')
    assert.equal(route.status, 404)
    assert.equal(route.body.error.code, 'NOT_FOUND')
  })
})

test('request bodies larger than 7 MiB are rejected', async () => {
  await withApi(async (api) => {
    const tooLarge = await api.request('/api/admin/articles', { method: 'POST', body: `"${'x'.repeat(7 * 1024 * 1024)}"` })
    assert.equal(tooLarge.status, 413)
    assert.equal(tooLarge.body.error.code, 'REQUEST_TOO_LARGE')
  })
})

test('remote and cross-origin writes are rejected', async () => {
  await withApi(async (api) => {
    const crossOrigin = await api.request('/api/admin/articles', { method: 'POST', origin: 'http://evil.test', body: '{}' })
    assert.equal(crossOrigin.status, 403)
    assert.equal(crossOrigin.body.error.code, 'ORIGIN_FORBIDDEN')
    const remote = await invokeMiddleware(api.middleware, { remoteAddress: '192.168.1.20' })
    assert.equal(remote.status, 403)
    assert.equal(remote.body.error.code, 'REMOTE_FORBIDDEN')
  })
})

test('production mode exposes no development API plugin', () => {
  assert.equal(articleAdminPlugin({ rootDir: process.cwd(), mode: 'production' }), undefined)
})
