import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
let articles = []
let loadError = null

try {
  ;({ articles } = await import('../src/data/articles.js'))
} catch (error) {
  loadError = error
}

function requireArticles() {
  assert.equal(loadError, null, `文章索引必须可加载：${loadError?.message}`)
  return articles
}

function fileFromPublicUrl(url) {
  return path.join(root, 'public', url.replace(/^\//, ''))
}

async function articleBodies() {
  return Promise.all(
    requireArticles().map(async (article) => ({
      article,
      body: await readFile(path.join(root, article.markdownPath), 'utf8'),
    })),
  )
}

test('至少发布两篇精选文章', () => {
  assert.ok(requireArticles().length >= 2)
})

test('每篇文章包含全部必填字段', () => {
  for (const article of requireArticles()) {
    for (const field of ['slug', 'title', 'summary', 'date', 'author', 'cover', 'markdownPath']) {
      assert.equal(typeof article[field], 'string', `${article.slug || '未知文章'} 缺少 ${field}`)
      assert.ok(article[field].trim(), `${article.slug || '未知文章'} 的 ${field} 为空`)
    }
  }
})

test('slug 唯一且适合 URL', () => {
  const slugs = requireArticles().map(({ slug }) => slug)
  assert.equal(new Set(slugs).size, slugs.length)
  slugs.forEach((slug) => assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/))
})

test('发布日期使用有效的 YYYY-MM-DD 格式并按倒序排列', () => {
  const dates = requireArticles().map(({ date }) => date)
  dates.forEach((date) => {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(Number.isNaN(Date.parse(`${date}T00:00:00Z`)), false)
  })
  assert.deepEqual(dates, [...dates].sort().reverse())
})

test('每篇 Markdown 文件真实存在', async () => {
  for (const article of requireArticles()) {
    await access(path.join(root, article.markdownPath))
  }
})

test('每篇正文至少包含 500 个中文字符', async () => {
  for (const { article, body } of await articleBodies()) {
    const chineseCharacters = body.match(/[\u3400-\u9fff]/g) ?? []
    assert.ok(chineseCharacters.length >= 500, `${article.slug} 只有 ${chineseCharacters.length} 个中文字符`)
  }
})

test('每篇文章含二级标题、列表、代码块和链接', async () => {
  for (const { article, body } of await articleBodies()) {
    assert.match(body, /^##\s+.+/m, `${article.slug} 缺少二级标题`)
    assert.match(body, /^[-*]\s+.+/m, `${article.slug} 缺少列表`)
    assert.match(body, /```[\s\S]+```/, `${article.slug} 缺少代码块`)
    assert.match(body, /\[[^\]]+\]\(https?:\/\/[^)]+\)/, `${article.slug} 缺少链接`)
  }
})

test('封面和正文引用的本地图片真实存在且有替代文本', async () => {
  for (const { article, body } of await articleBodies()) {
    await access(fileFromPublicUrl(article.cover))
    const images = [...body.matchAll(/!\[([^\]]+)\]\((\/articles\/[^)]+)\)/g)]
    assert.ok(images.length >= 1, `${article.slug} 缺少正文图片`)
    for (const [, alt, url] of images) {
      assert.ok(alt.trim(), `${article.slug} 的图片缺少替代文本`)
      await access(fileFromPublicUrl(url))
    }
  }
})

test('文章 Hash URL 能解析 slug，首页锚点不被误判为文章', async () => {
  const { articleSlugFromHash } = await import('../src/data/articles.js')
  assert.equal(articleSlugFromHash('#/articles/build-a-learning-map'), 'build-a-learning-map')
  assert.equal(articleSlugFromHash('#articles'), null)
  assert.equal(articleSlugFromHash('#resources'), null)
})

test('文章查找对有效 slug 返回文章，对无效 slug 返回空值', async () => {
  const { findArticleBySlug } = await import('../src/data/articles.js')
  assert.equal(findArticleBySlug('read-open-source-projects')?.title, '第一次读开源项目，从一条真实路径开始')
  assert.equal(findArticleBySlug('missing-article'), null)
})

const distDir = path.join(root, 'dist')

test('生产构建输出入口页面', async () => {
  try {
    await access(path.join(distDir, 'index.html'))
  } catch {
    assert.fail('dist/index.html 不存在，请先运行 npm run build 生成生产制品')
  }
})

test('生产制品不含文章管理端点与可写 API', async () => {
  let entries
  try {
    entries = await readdir(path.join(distDir, 'assets'))
  } catch {
    assert.fail('dist/assets 目录不存在，请先运行 npm run build 生成生产制品')
    return
  }
  const scripts = entries.filter((name) => name.endsWith('.js'))
  assert.ok(scripts.length >= 1, 'dist/assets 下没有任何 .js 制品')
  const forbiddenStrings = ['/api/admin/articles', 'saveArticle', 'uploadImage']
  for (const script of scripts) {
    const content = await readFile(path.join(distDir, 'assets', script), 'utf8')
    for (const forbidden of forbiddenStrings) {
      assert.ok(!content.includes(forbidden), `生产制品 assets/${script} 包含 "${forbidden}"，文章管理功能泄漏到了生产构建`)
    }
  }
})
