import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'

import { AdminApiError, createAdminApi, fileToUploadPayload } from '../src/admin/article-admin-api.js'

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', source: '', shortCircuit: true }
    }
    if (url.endsWith('.jsx')) {
      return { format: 'module', source: readFileSync(new URL(url), 'utf8'), shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

const {
  canApplyAsyncResult,
  createAsyncRequestSnapshot,
  createNewArticleDraft,
  hasUnsavedChanges,
  insertMarkdownAtSelection,
  slugifyTitle,
} = await import('../src/admin/ArticleAdmin.jsx')

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

test('article titles produce stable URL-safe slugs with a timestamp fallback for Chinese-only text', () => {
  const NativeDate = globalThis.Date
  globalThis.Date = class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : ['2026-08-13T09:07:05']))
    }
  }
  try {
    assert.equal(slugifyTitle('  Hello, React World!  '), 'hello-react-world')
    assert.equal(slugifyTitle('本地文章管理'), 'article-20260813-090705')
  } finally {
    globalThis.Date = NativeDate
  }
})

test('Markdown insertion replaces selected text as link copy and inserts image syntax at the caret', () => {
  assert.deepEqual(
    insertMarkdownAtSelection('访问文档', 2, 4, '[链接文字](https://example.com)'),
    { source: '访问[文档](https://example.com)', selectionStart: 2, selectionEnd: 27 },
  )
  assert.deepEqual(
    insertMarkdownAtSelection('封面之后', 2, 2, '![架构图](/articles/demo/diagram.png)'),
    { source: '封面![架构图](/articles/demo/diagram.png)之后', selectionStart: 36, selectionEnd: 36 },
  )
})

test('dirty comparison follows draft values instead of object identity', () => {
  const saved = { slug: 'same', title: '同一篇', body: '正文', nested: { cover: '/cover.png' } }
  assert.equal(hasUnsavedChanges(saved, { ...saved, nested: { cover: '/cover.png' } }), false)
  assert.equal(hasUnsavedChanges(saved, { ...saved, body: '已修改' }), true)
})

test('new article starter body passes the publishing content floor and includes required Markdown', () => {
  const draft = createNewArticleDraft()
  assert.ok((draft.body.match(/[\u3400-\u9fff]/g) ?? []).length >= 500)
  assert.match(draft.body, /^## /m)
  assert.match(draft.body, /^- /m)
  assert.match(draft.body, /```js[\s\S]+```/)
  assert.match(draft.body, /\[[^\]]+\]\(https?:\/\/[^)]+\)/)
})

test('late async results cannot apply after switching articles or editing the request draft', () => {
  const draft = { slug: 'first-post', title: '第一篇', cover: '/cover.png', body: '原正文' }
  const request = createAsyncRequestSnapshot('first-post', draft)

  assert.equal(canApplyAsyncResult(request, 'second-post', { ...draft, slug: 'second-post' }), false)
  assert.equal(canApplyAsyncResult(request, 'first-post', { ...draft, body: '等待期间的新输入' }), false)
  assert.equal(canApplyAsyncResult(request, 'first-post', { ...draft }), true)
})
