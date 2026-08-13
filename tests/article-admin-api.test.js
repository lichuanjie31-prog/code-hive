import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import test from 'node:test'

import { AdminApiError, createAdminApi, fileToUploadPayload } from '../src/admin/article-admin-api.js'

function installFileReader() {
  const original = globalThis.FileReader
  globalThis.FileReader = class FileReader {
    readAsDataURL(file) {
      file.arrayBuffer().then((buffer) => {
        this.result = `data:${file.type};base64,${Buffer.from(buffer).toString('base64')}`
        this.onload?.()
      }).catch((error) => {
        this.error = error
        this.onerror?.()
      })
    }
  }
  return () => {
    globalThis.FileReader = original
  }
}

function recordingFetch({ data = { ok: true }, error } = {}) {
  const calls = []
  return {
    calls,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, ...options })
      return {
        ok: !error,
        status: error?.status ?? 200,
        json: async () => (error ? { error } : { data }),
      }
    },
  }
}

test('article editor sends each action to the exact encoded admin endpoint', async () => {
  const { calls, fetchImpl } = recordingFetch()
  const api = createAdminApi(fetchImpl)
  const payload = { article: { slug: 'new-post' }, body: 'Draft' }

  await api.listArticles()
  await api.getArticle('first post')
  await api.saveArticle(null, payload)
  await api.saveArticle('old post', payload)
  await api.deleteArticle('old post')

  assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
    ['/api/admin/articles', 'GET'],
    ['/api/admin/articles/first%20post', 'GET'],
    ['/api/admin/articles', 'POST'],
    ['/api/admin/articles/old%20post', 'PUT'],
    ['/api/admin/articles/old%20post', 'DELETE'],
  ])
  assert.equal(calls[2].headers['content-type'], 'application/json')
  assert.equal(calls[2].body, JSON.stringify(payload))
  assert.equal(calls[3].body, JSON.stringify(payload))
  assert.equal(calls[4].body, JSON.stringify({ confirmed: true }))
})

test('article editor returns parsed data from every successful response', async () => {
  const article = { slug: 'first-post', title: 'First post' }
  const { fetchImpl } = recordingFetch({ data: article })
  const api = createAdminApi(fetchImpl)

  assert.deepEqual(await api.getArticle('first-post'), article)
})

test('article editor shows API error details instead of hiding a rejected change', async () => {
  const { fetchImpl } = recordingFetch({
    error: { status: 409, code: 'DUPLICATE_SLUG', message: 'An article already uses this slug.' },
  })
  const api = createAdminApi(fetchImpl)

  await assert.rejects(api.saveArticle(null, { article: {}, body: '' }), (error) => {
    assert.ok(error instanceof AdminApiError)
    assert.equal(error.status, 409)
    assert.equal(error.code, 'DUPLICATE_SLUG')
    assert.equal(error.message, 'An article already uses this slug.')
    return true
  })
})

test('image upload sends the selected file as a base64 JSON payload', async () => {
  const restoreFileReader = installFileReader()
  try {
    const file = new File(['hello'], 'diagram.png', { type: 'image/png' })
    const { calls, fetchImpl } = recordingFetch({ data: { url: '/articles/first-post/diagram.png' } })
    const api = createAdminApi(fetchImpl)

    const result = await api.uploadImage('first-post', file, 'image')

    assert.deepEqual(result, { url: '/articles/first-post/diagram.png' })
    assert.deepEqual(JSON.parse(calls[0].body), {
      kind: 'image',
      fileName: 'diagram.png',
      mimeType: 'image/png',
      base64: 'aGVsbG8=',
    })
    assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
      ['/api/admin/articles/first-post/images', 'POST'],
    ])
  } finally {
    restoreFileReader()
  }
})

test('image picker blocks unsupported and oversized files before upload', async () => {
  const unsupported = new File(['text'], 'notes.txt', { type: 'text/plain' })
  const tooLarge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })

  await assert.rejects(fileToUploadPayload(unsupported, 'image'), /PNG, JPEG, WebP, and SVG/)
  await assert.rejects(fileToUploadPayload(tooLarge, 'cover'), /5 MiB/)
})
