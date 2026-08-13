import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const chinesePattern = /[\u3400-\u9fff]/g
const markdownImagePattern = /!\[([^\]]*)\]\((\/articles\/[^)]+)\)/g
const articleFields = ['slug', 'title', 'summary', 'date', 'author', 'cover', 'markdownPath']
const mimeExtensions = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}
const maxUploadBytes = 5 * 1024 * 1024
let importVersion = 0

export class ArticleStoreError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'ArticleStoreError'
    this.status = status
    this.code = code
  }
}

function fail(status, code, message) {
  throw new ArticleStoreError(status, code, message)
}

export function validateSlug(slug) {
  if (typeof slug !== 'string' || !slugPattern.test(slug)) {
    fail(400, 'INVALID_SLUG', 'Slug must be lowercase letters, digits, and single hyphens.')
  }
  return slug
}

function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
}

export function validateArticleInput(article, body) {
  if (!article || typeof article !== 'object' || Array.isArray(article)) {
    fail(422, 'INVALID_ARTICLE', 'Article metadata is required.')
  }
  for (const field of articleFields) {
    if (typeof article[field] !== 'string' || !article[field].trim()) {
      fail(422, 'INVALID_ARTICLE', `Article field ${field} is required.`)
    }
  }
  validateSlug(article.slug)
  if (!validDate(article.date)) fail(422, 'INVALID_DATE', 'Date must be a valid YYYY-MM-DD value.')
  if (article.markdownPath !== `src/content/articles/${article.slug}.md`) {
    fail(422, 'INVALID_ARTICLE', 'Markdown path does not match the article slug.')
  }
  if (!article.cover.startsWith('/articles/') || article.cover.includes('..')) {
    fail(422, 'INVALID_ARTICLE', 'Cover must be an article asset URL.')
  }
  if (typeof body !== 'string') fail(422, 'INVALID_BODY', 'Markdown body is required.')
  if ((body.match(chinesePattern) ?? []).length < 500) {
    fail(422, 'BODY_TOO_SHORT', 'Markdown body must contain at least 500 Chinese characters.')
  }
  for (const match of body.matchAll(markdownImagePattern)) {
    if (!match[1].trim()) fail(422, 'MISSING_IMAGE_ALT', 'Markdown images require alt text.')
  }
  return { ...article }
}

function safePath(base, ...parts) {
  const target = resolve(base, ...parts)
  const inside = relative(base, target)
  if (inside.split(/[\\/]/).includes('..') || isAbsolute(inside)) {
    fail(400, 'INVALID_PATH', 'Path escapes its allowed directory.')
  }
  return target
}

function serializeArticles(articles) {
  const safeArticles = articles.map((article) => {
    const result = {}
    for (const field of articleFields) result[field] = article[field]
    return result
  })
  return `export const articles = ${JSON.stringify(safeArticles, null, 2)}\n\nexport function articleSlugFromHash(hash) {\n  const match = /^#\\/articles\\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(hash)\n  return match ? match[1] : null\n}\n\nexport function findArticleBySlug(slug) {\n  return articles.find((article) => article.slug === slug) ?? null\n}\n`
}

function uploadSize(base64) {
  if (typeof base64 !== 'string' || !base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    fail(400, 'INVALID_BASE64', 'Upload data must be valid base64.')
  }
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return (base64.length / 4) * 3 - padding
}

function uploadStem(fileName) {
  const name = typeof fileName === 'string' ? basename(fileName) : ''
  const stem = name.slice(0, Math.max(0, name.length - extname(name).length))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return stem || 'image'
}

export function createArticleStore({ rootDir, fsImpl = {} }) {
  if (typeof rootDir !== 'string' || !rootDir) throw new TypeError('rootDir is required')
  const fs = { access, mkdir, readFile, rename, rm, writeFile, ...fsImpl }
  const sourceDir = safePath(rootDir, 'src')
  const articleDir = safePath(sourceDir, 'content', 'articles')
  const publicArticleDir = safePath(rootDir, 'public', 'articles')
  const indexPath = safePath(sourceDir, 'data', 'articles.js')

  const bodyPath = (slug) => safePath(articleDir, `${validateSlug(slug)}.md`)
  const ownedImageDir = (slug) => safePath(publicArticleDir, validateSlug(slug))

  async function indexArticles() {
    const url = `${pathToFileURL(indexPath).href}?t=${Date.now()}-${++importVersion}`
    const module = await import(url)
    if (!Array.isArray(module.articles)) fail(500, 'INVALID_INDEX', 'Article index does not export an articles array.')
    return module.articles.map((article) => ({ ...article }))
  }

  async function replacePair({ nextBody, nextIndex, targetBody, targetIndex }) {
    const bodyTemp = `${targetBody}.tmp`
    const indexTemp = `${targetIndex}.tmp`
    const bodyBackup = `${targetBody}.bak`
    const indexBackup = `${targetIndex}.bak`
    const backups = []
    const replacements = []
    try {
      await fs.writeFile(bodyTemp, nextBody, 'utf8')
      await fs.writeFile(indexTemp, nextIndex, 'utf8')
      if ((await fs.readFile(bodyTemp, 'utf8')) !== nextBody || (await fs.readFile(indexTemp, 'utf8')) !== nextIndex) {
        fail(500, 'WRITE_VALIDATION_FAILED', 'Temporary article files could not be validated.')
      }
      for (const [target, backup] of [[targetBody, bodyBackup], [targetIndex, indexBackup]]) {
        try {
          await fs.rename(target, backup)
          backups.push([target, backup])
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error
        }
      }
      for (const [temp, target] of [[bodyTemp, targetBody], [indexTemp, targetIndex]]) {
        await fs.rename(temp, target)
        replacements.push(target)
      }
    } catch (error) {
      for (const target of replacements.reverse()) await fs.rm(target, { force: true }).catch(() => {})
      for (const [target, backup] of backups.reverse()) {
        await fs.rename(backup, target).catch(() => {})
      }
      throw error
    } finally {
      await Promise.all([bodyTemp, indexTemp, bodyBackup, indexBackup].map((file) => fs.rm(file, { force: true }).catch(() => {})))
    }
  }

  async function replaceIndex(nextIndex) {
    const temp = `${indexPath}.tmp`
    const backup = `${indexPath}.bak`
    let backedUp = false
    let replaced = false
    try {
      await fs.writeFile(temp, nextIndex, 'utf8')
      if ((await fs.readFile(temp, 'utf8')) !== nextIndex) fail(500, 'WRITE_VALIDATION_FAILED', 'Temporary index could not be validated.')
      await fs.rename(indexPath, backup)
      backedUp = true
      await fs.rename(temp, indexPath)
      replaced = true
    } catch (error) {
      if (replaced) await fs.rm(indexPath, { force: true }).catch(() => {})
      if (backedUp) await fs.rename(backup, indexPath).catch(() => {})
      throw error
    } finally {
      await Promise.all([temp, backup].map((file) => fs.rm(file, { force: true }).catch(() => {})))
    }
  }

  return {
    async list() {
      return indexArticles()
    },

    async get(slug) {
      validateSlug(slug)
      const article = (await indexArticles()).find((item) => item.slug === slug)
      if (!article) fail(404, 'ARTICLE_NOT_FOUND', 'Article was not found.')
      return { ...article, body: await fs.readFile(bodyPath(slug), 'utf8') }
    },

    async save({ originalSlug, article, body }) {
      if (!article || typeof article !== 'object') fail(422, 'INVALID_ARTICLE', 'Article metadata is required.')
      if (typeof article.slug === 'string' && slugPattern.test(article.slug)) {
        const existing = await indexArticles()
        if (existing.some((item) => item.slug === article.slug && item.slug !== originalSlug)) {
          fail(409, 'DUPLICATE_SLUG', 'An article already uses this slug.')
        }
      }
      const nextArticle = validateArticleInput(article, body)
      if (originalSlug !== null && originalSlug !== undefined) validateSlug(originalSlug)
      const current = await indexArticles()
      const oldArticle = originalSlug ? current.find((item) => item.slug === originalSlug) : null
      if (originalSlug && !oldArticle) fail(404, 'ARTICLE_NOT_FOUND', 'Article was not found.')
      const nextArticles = [...current.filter((item) => item.slug !== originalSlug), nextArticle]
        .sort((left, right) => right.date.localeCompare(left.date))
      const nextIndex = serializeArticles(nextArticles)
      const target = bodyPath(nextArticle.slug)
      await fs.mkdir(dirname(target), { recursive: true })
      await replacePair({ nextBody: body, nextIndex, targetBody: target, targetIndex: indexPath })
      if (originalSlug && originalSlug !== nextArticle.slug) {
        await fs.rm(bodyPath(originalSlug), { force: true })
      }
      return { ...nextArticle, body }
    },

    async upload({ slug, kind, fileName, mimeType, base64 }) {
      validateSlug(slug)
      const extension = mimeExtensions[mimeType]
      if (!extension) fail(415, 'UNSUPPORTED_MIME_TYPE', 'Only PNG, JPEG, WebP, and SVG images are allowed.')
      if (kind !== 'image' && kind !== 'cover') fail(400, 'INVALID_UPLOAD_KIND', 'Upload kind must be image or cover.')
      const size = uploadSize(base64)
      if (size > maxUploadBytes) fail(413, 'FILE_TOO_LARGE', 'Upload exceeds the 5 MiB limit.')
      const data = Buffer.from(base64, 'base64')
      if (data.length !== size) fail(400, 'INVALID_BASE64', 'Upload data must be valid base64.')
      const directory = ownedImageDir(slug)
      await fs.mkdir(directory, { recursive: true })
      let name = kind === 'cover' ? `cover.${extension}` : `${uploadStem(fileName)}.${extension}`
      if (kind === 'image') {
        const stem = name.slice(0, -extension.length - 1)
        let suffix = 2
        while (true) {
          try {
            await fs.access(safePath(directory, name))
            name = `${stem}-${suffix++}.${extension}`
          } catch (error) {
            if (error?.code === 'ENOENT') break
            throw error
          }
        }
      }
      await fs.writeFile(safePath(directory, name), data)
      return { url: `/articles/${slug}/${name}` }
    },

    async remove({ slug, confirmed }) {
      validateSlug(slug)
      if (confirmed !== true) fail(400, 'CONFIRMATION_REQUIRED', 'Article deletion requires confirmation.')
      const current = await indexArticles()
      if (!current.some((item) => item.slug === slug)) fail(404, 'ARTICLE_NOT_FOUND', 'Article was not found.')
      const nextIndex = serializeArticles(current.filter((item) => item.slug !== slug))
      await replaceIndex(nextIndex)
      await fs.rm(bodyPath(slug), { force: true })
      await fs.rm(ownedImageDir(slug), { recursive: true, force: true })
    },
  }
}
