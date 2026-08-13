import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile, mkdir, rename as realRename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ArticleStoreError, createArticleStore, validateArticleInput, validateSlug } from '../server/article-store.js'

const validBody = `${'汉'.repeat(500)}\n\n![示意图](/articles/new-post/diagram.png)`
const validArticle = {
  slug: 'new-post',
  title: '新文章',
  summary: '用于验证本地文章管理。',
  date: '2026-08-14',
  author: 'code-hive 编辑部',
  cover: '/articles/shared-cover.svg',
  markdownPath: 'src/content/articles/new-post.md',
}
const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9BwAAAABJRU5ErkJggg=='

async function createProject() {
  const rootDir = await mkdtemp(join(tmpdir(), 'article-store-'))
  await mkdir(join(rootDir, 'src/content/articles'), { recursive: true })
  await mkdir(join(rootDir, 'src/data'), { recursive: true })
  await mkdir(join(rootDir, 'public/articles/first-post'), { recursive: true })
  await writeFile(join(rootDir, 'src/content/articles/first-post.md'), validBody)
  await writeFile(join(rootDir, 'src/content/articles/older-post.md'), validBody)
  await writeFile(join(rootDir, 'public/articles/shared-cover.svg'), '<svg/>')
  await writeFile(join(rootDir, 'public/articles/first-post/owned.png'), 'owned')
  await writeFile(join(rootDir, 'src/data/articles.js'), `export const articles = [\n  { slug: 'first-post', title: '第一篇', summary: '第一篇摘要', date: '2026-08-13', author: '编辑部', cover: '/articles/shared-cover.svg', markdownPath: 'src/content/articles/first-post.md' },\n  { slug: 'older-post', title: '旧文章', summary: '旧文章摘要', date: '2026-08-01', author: '编辑部', cover: '/articles/shared-cover.svg', markdownPath: 'src/content/articles/older-post.md' },\n]\n\nexport function articleSlugFromHash(hash) {\n  const match = /^#\\/articles\\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(hash)\n  return match ? match[1] : null\n}\n\nexport function findArticleBySlug(slug) {\n  return articles.find((article) => article.slug === slug) ?? null\n}\n`)
  return rootDir
}

async function withProject(run) {
  const rootDir = await createProject()
  try {
    await run(rootDir)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

test('list and get return article metadata with Markdown body', async () => {
  await withProject(async (rootDir) => {
    const store = createArticleStore({ rootDir })
    assert.equal((await store.list()).length, 2)
    assert.equal((await store.get('first-post')).body, validBody)
  })
})

test('save creates a valid article and keeps the index date-descending', async () => {
  await withProject(async (rootDir) => {
    const store = createArticleStore({ rootDir })
    await store.save({ originalSlug: null, article: validArticle, body: validBody })
    assert.deepEqual((await store.list()).map((item) => item.slug), ['new-post', 'first-post', 'older-post'])
    assert.equal(await readFile(join(rootDir, 'src/content/articles/new-post.md'), 'utf8'), validBody)
  })
})

test('save rejects duplicate and traversal slugs without touching files', async () => {
  await withProject(async (rootDir) => {
    const store = createArticleStore({ rootDir })
    const before = await readFile(join(rootDir, 'src/data/articles.js'), 'utf8')
    await assert.rejects(() => store.save({ originalSlug: null, article: { ...validArticle, slug: 'first-post' }, body: validBody }), { code: 'DUPLICATE_SLUG' })
    await assert.rejects(() => store.get('../package.json'), { code: 'INVALID_SLUG' })
    assert.equal(await readFile(join(rootDir, 'src/data/articles.js'), 'utf8'), before)
  })
})

test('upload writes only an allowed image under the article directory', async () => {
  await withProject(async (rootDir) => {
    const store = createArticleStore({ rootDir })
    const result = await store.upload({ slug: 'new-post', kind: 'image', fileName: 'diagram.png', mimeType: 'image/png', base64: tinyPngBase64 })
    assert.equal(result.url, '/articles/new-post/diagram.png')
    await access(join(rootDir, 'public/articles/new-post/diagram.png'))
  })
})

test('remove requires confirmation and leaves shared images untouched', async () => {
  await withProject(async (rootDir) => {
    const store = createArticleStore({ rootDir })
    await assert.rejects(() => store.remove({ slug: 'first-post', confirmed: false }), { code: 'CONFIRMATION_REQUIRED' })
    await store.remove({ slug: 'first-post', confirmed: true })
    await access(join(rootDir, 'public/articles/shared-cover.svg'))
    await assert.rejects(() => access(join(rootDir, 'src/content/articles/first-post.md')))
  })
})

test('validation rejects missing fields, invalid dates, short Chinese bodies, and image alt text omissions', () => {
  assert.throws(() => validateArticleInput({ ...validArticle, title: '' }, validBody), { code: 'INVALID_ARTICLE' })
  assert.throws(() => validateArticleInput({ ...validArticle, date: '2026-02-30' }, validBody), { code: 'INVALID_DATE' })
  assert.throws(() => validateArticleInput(validArticle, '汉'.repeat(499)), { code: 'BODY_TOO_SHORT' })
  assert.throws(() => validateArticleInput(validArticle, `${'汉'.repeat(500)}\n![](/articles/new-post/image.png)`), { code: 'MISSING_IMAGE_ALT' })
  assert.throws(() => validateSlug('bad/slug'), { code: 'INVALID_SLUG' })
})

test('upload rejects disallowed MIME types and files above 5 MiB', async () => {
  await withProject(async (rootDir) => {
    const store = createArticleStore({ rootDir })
    await assert.rejects(() => store.upload({ slug: 'new-post', kind: 'image', fileName: 'note.txt', mimeType: 'text/plain', base64: 'aGVsbG8=' }), { code: 'UNSUPPORTED_MIME_TYPE' })
    const overLimit = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')
    await assert.rejects(() => store.upload({ slug: 'new-post', kind: 'image', fileName: 'large.png', mimeType: 'image/png', base64: overLimit }), { code: 'FILE_TOO_LARGE' })
  })
})

test('upload cleans filenames and appends a suffix on collision', async () => {
  await withProject(async (rootDir) => {
    const store = createArticleStore({ rootDir })
    const input = { slug: 'new-post', kind: 'image', fileName: 'Diagram Final!!.png', mimeType: 'image/png', base64: tinyPngBase64 }
    assert.equal((await store.upload(input)).url, '/articles/new-post/diagram-final.png')
    assert.equal((await store.upload(input)).url, '/articles/new-post/diagram-final-2.png')
  })
})

test('save rejects rename collisions and restores both files after a replacement failure', async () => {
  await withProject(async (rootDir) => {
    const indexPath = join(rootDir, 'src/data/articles.js')
    const bodyPath = join(rootDir, 'src/content/articles/first-post.md')
    const beforeIndex = await readFile(indexPath, 'utf8')
    const beforeBody = await readFile(bodyPath, 'utf8')
    let failed = false
    const store = createArticleStore({
      rootDir,
      fsImpl: {
        rename: async (from, to) => {
          if (!failed && from.endsWith('.tmp') && to === indexPath) {
            failed = true
            throw new Error('simulated replacement failure')
          }
          return realRename(from, to)
        },
      },
    })
    await assert.rejects(() => store.save({ originalSlug: 'first-post', article: { ...validArticle, slug: 'first-post' }, body: `${'汉'.repeat(500)}\nchanged` }))
    assert.equal(await readFile(indexPath, 'utf8'), beforeIndex)
    assert.equal(await readFile(bodyPath, 'utf8'), beforeBody)
  })
})

test('save rejects an existing target when renaming an article', async () => {
  await withProject(async (rootDir) => {
    const store = createArticleStore({ rootDir })
    await assert.rejects(() => store.save({ originalSlug: 'older-post', article: { ...validArticle, slug: 'first-post' }, body: validBody }), { code: 'DUPLICATE_SLUG' })
  })
})

test('ArticleStoreError exposes an HTTP status and stable code', () => {
  const error = new ArticleStoreError(422, 'INVALID_ARTICLE', 'Article is invalid')
  assert.equal(error.status, 422)
  assert.equal(error.code, 'INVALID_ARTICLE')
})
