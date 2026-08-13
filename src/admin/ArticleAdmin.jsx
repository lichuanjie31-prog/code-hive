/* oxlint-disable react/only-export-components -- Task API intentionally exports tested helpers beside the component. */
import React, { lazy, useEffect, useMemo, useRef, useState } from 'react'

import { createAdminApi } from './article-admin-api.js'
import './ArticleAdmin.css'

const MarkdownArticle = lazy(() => import('../articles/MarkdownArticle.jsx').then((module) => ({
  default: module.MarkdownArticle,
})))

const h = React.createElement
const defaultAuthor = 'code-hive 编辑部'
const starterBody = `## 文章标题

在这里写下文章正文。

## 要点

- 第一个要点
- 第二个要点
`

function pad(value) {
  return String(value).padStart(2, '0')
}

function timestampSlug(date = new Date()) {
  return `article-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function slugifyTitle(title) {
  const slug = String(title ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || timestampSlug()
}

export function insertMarkdownAtSelection(source, selectionStart, selectionEnd, snippet) {
  const start = Math.max(0, Number(selectionStart) || 0)
  const end = Math.max(start, Number(selectionEnd) || start)
  const selected = source.slice(start, end)
  const insertion = selected && snippet.includes('链接文字')
    ? snippet.replace('链接文字', selected)
    : snippet
  const nextSource = `${source.slice(0, start)}${insertion}${source.slice(end)}`
  const cursor = start + insertion.length
  return {
    source: nextSource,
    selectionStart: selected ? start : cursor,
    selectionEnd: cursor,
  }
}

function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, comparable(value[key])]))
  }
  return value
}

export function hasUnsavedChanges(saved, draft) {
  return JSON.stringify(comparable(saved)) !== JSON.stringify(comparable(draft))
}

function localDate() {
  const date = new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function newDraft() {
  return {
    slug: '',
    title: '',
    summary: '',
    date: localDate(),
    author: defaultAuthor,
    cover: '',
    markdownPath: '',
    body: starterBody,
  }
}

function draftFromArticle(article) {
  return {
    slug: article.slug ?? '',
    title: article.title ?? '',
    summary: article.summary ?? '',
    date: article.date ?? localDate(),
    author: article.author ?? defaultAuthor,
    cover: article.cover ?? '',
    markdownPath: article.markdownPath ?? '',
    body: article.body ?? starterBody,
  }
}

function Field({ label, children, className = '' }) {
  return h('label', { className: `admin-field ${className}`.trim() },
    h('span', null, label),
    children,
  )
}

function Status({ message, error = false }) {
  if (!message) return null
  return h('p', { className: error ? 'admin-alert' : 'admin-status', role: error ? 'alert' : 'status' }, message)
}

export function ArticleAdmin() {
  const api = useMemo(() => createAdminApi(), [])
  const textareaRef = useRef(null)
  const [articles, setArticles] = useState([])
  const [search, setSearch] = useState('')
  const [originalSlug, setOriginalSlug] = useState(null)
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [pageError, setPageError] = useState('')
  const [coverError, setCoverError] = useState('')
  const [imageError, setImageError] = useState('')
  const [status, setStatus] = useState('')
  const [inlineAlt, setInlineAlt] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [renamePending, setRenamePending] = useState(false)
  const [deletePending, setDeletePending] = useState(false)

  const dirty = Boolean(draft && hasUnsavedChanges(saved, draft))
  const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft?.slug ?? '')

  async function selectArticle(slug) {
    setLoading(true)
    setPageError('')
    setStatus('')
    setRenamePending(false)
    setDeletePending(false)
    try {
      const article = draftFromArticle(await api.getArticle(slug))
      setOriginalSlug(slug)
      setSlugEdited(false)
      setSaved(article)
      setDraft(article)
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadArticles(preferredSlug) {
    setLoading(true)
    setPageError('')
    try {
      const list = await api.listArticles()
      setArticles(list)
      const target = preferredSlug && list.some((item) => item.slug === preferredSlug)
        ? preferredSlug
        : list[0]?.slug
      if (target) {
        await selectArticle(target)
      } else {
        setOriginalSlug(null)
        setSaved(null)
        setDraft(null)
        setLoading(false)
      }
    } catch (error) {
      setPageError(error.message)
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    async function loadInitialArticle() {
      setLoading(true)
      setPageError('')
      try {
        const list = await api.listArticles()
        if (!active) return
        setArticles(list)
        if (!list.length) {
          setLoading(false)
          return
        }
        const article = draftFromArticle(await api.getArticle(list[0].slug))
        if (!active) return
        setOriginalSlug(list[0].slug)
        setSlugEdited(false)
        setSaved(article)
        setDraft(article)
      } catch (error) {
        if (active) setPageError(error.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    loadInitialArticle()
    return () => {
      active = false
    }
  }, [api])

  useEffect(() => {
    if (!dirty) return undefined
    const protectDraft = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectDraft)
    return () => window.removeEventListener('beforeunload', protectDraft)
  }, [dirty])

  function startNewArticle() {
    const next = newDraft()
    setOriginalSlug(null)
    setSlugEdited(false)
    setSaved(null)
    setDraft(next)
    setPageError('')
    setStatus('正在新建文章')
    setRenamePending(false)
    setDeletePending(false)
  }

  function updateField(field, value) {
    if (field === 'slug') setSlugEdited(true)
    setDraft((current) => {
      const next = { ...current, [field]: value }
      if (field === 'title' && !originalSlug && !slugEdited) {
        next.slug = slugifyTitle(value)
      }
      return next
    })
    setStatus('')
  }

  function insertMarkdown(snippet) {
    if (!draft) return
    const textarea = textareaRef.current
    const result = insertMarkdownAtSelection(
      draft.body,
      textarea?.selectionStart ?? draft.body.length,
      textarea?.selectionEnd ?? draft.body.length,
      snippet,
    )
    updateField('body', result.source)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  async function saveDraft(confirmed = false) {
    if (!draft || busy) return
    const renamed = originalSlug && draft.slug !== originalSlug
    if (renamed && !confirmed) {
      setRenamePending(true)
      return
    }
    setBusy('save')
    setPageError('')
    setStatus('')
    try {
      const article = { ...draft }
      delete article.body
      article.markdownPath = `src/content/articles/${draft.slug}.md`
      const savedArticle = await api.saveArticle(originalSlug, { article, body: draft.body })
      setRenamePending(false)
      await loadArticles(savedArticle.slug ?? draft.slug)
      setStatus('文章已保存')
    } catch (error) {
      setPageError(error.message)
    } finally {
      setBusy('')
    }
  }

  async function uploadCover(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !validSlug) return
    setBusy('cover')
    setCoverError('')
    try {
      const result = await api.uploadImage(draft.slug, file, 'cover')
      updateField('cover', result.url)
    } catch (error) {
      setCoverError(error.message)
    } finally {
      setBusy('')
    }
  }

  async function uploadInlineImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !validSlug) return
    if (!inlineAlt.trim()) {
      setImageError('请先填写插图替代文本')
      return
    }
    setBusy('image')
    setImageError('')
    try {
      const result = await api.uploadImage(draft.slug, file, 'image')
      insertMarkdown(`![${inlineAlt.trim()}](${result.url})`)
      setInlineAlt('')
    } catch (error) {
      setImageError(error.message)
    } finally {
      setBusy('')
    }
  }

  async function deleteArticle() {
    if (!originalSlug || busy) return
    setBusy('delete')
    setPageError('')
    try {
      await api.deleteArticle(originalSlug)
      setDeletePending(false)
      await loadArticles()
      setStatus('文章已删除')
    } catch (error) {
      setPageError(error.message)
    } finally {
      setBusy('')
    }
  }

  const filteredArticles = articles.filter((article) => {
    const query = search.trim().toLowerCase()
    return !query || article.title.toLowerCase().includes(query) || article.slug.includes(query)
  })

  const listRail = h('aside', { className: 'admin-list-rail', 'aria-label': '文章列表' },
    h('div', { className: 'admin-list-actions' },
      h('a', { href: '#top', className: 'admin-home-link' }, '返回首页'),
      h('button', { type: 'button', className: 'admin-primary-button', onClick: startNewArticle }, '新建文章'),
    ),
    h(Field, { label: '搜索文章', className: 'admin-search' },
      h('input', { type: 'search', value: search, onChange: (event) => setSearch(event.target.value), placeholder: '标题或 slug' }),
    ),
    h('div', { className: 'admin-article-buttons' },
      filteredArticles.map((article) => h('button', {
        type: 'button',
        className: originalSlug === article.slug ? 'is-active' : '',
        onClick: () => selectArticle(article.slug),
        key: article.slug,
      }, h('strong', null, article.title), h('span', null, article.slug))),
      !loading && articles.length === 0 ? h('p', { className: 'admin-empty', role: 'status' }, '还没有文章，创建第一篇吧。') : null,
      !loading && articles.length > 0 && filteredArticles.length === 0 ? h('p', { className: 'admin-empty', role: 'status' }, '没有匹配的文章。') : null,
    ),
  )

  let mainContent
  if (loading && !draft) {
    mainContent = h('div', { className: 'admin-screen-state', role: 'status' }, '正在加载文章…')
  } else if (!draft) {
    mainContent = h('div', { className: 'admin-screen-state' },
      h('h1', null, '文章管理'),
      h('p', { role: pageError ? 'alert' : 'status' }, pageError || '选择一篇文章，或创建新文章。'),
      pageError ? h('button', { type: 'button', onClick: () => loadArticles() }, '重新加载') : null,
    )
  } else {
    const toolbar = h('div', { className: 'admin-toolbar', 'aria-label': 'Markdown 工具栏' },
      h('button', { type: 'button', onClick: () => insertMarkdown('## 标题') }, '标题'),
      h('button', { type: 'button', onClick: () => insertMarkdown('- 列表项') }, '列表'),
      h('button', { type: 'button', onClick: () => insertMarkdown('[链接文字](https://example.com)') }, '链接'),
      h('button', { type: 'button', onClick: () => insertMarkdown('```js\nconsole.log(\'hello\')\n```') }, 'JS 代码'),
    )

    const metadata = h('section', { className: 'admin-metadata', 'aria-labelledby': 'metadata-title' },
      h('h2', { id: 'metadata-title' }, '文章信息'),
      h(Field, { label: '标题' }, h('input', { required: true, value: draft.title, onChange: (event) => updateField('title', event.target.value) })),
      h(Field, { label: 'Slug' }, h('input', { required: true, pattern: '[a-z0-9]+(?:-[a-z0-9]+)*', value: draft.slug, onChange: (event) => updateField('slug', event.target.value) })),
      h(Field, { label: '摘要', className: 'admin-field-wide' }, h('textarea', { rows: 3, value: draft.summary, onChange: (event) => updateField('summary', event.target.value) })),
      h(Field, { label: '发布日期' }, h('input', { type: 'date', value: draft.date, onChange: (event) => updateField('date', event.target.value) })),
      h(Field, { label: '作者' }, h('input', { value: draft.author, onChange: (event) => updateField('author', event.target.value) })),
      h(Field, { label: '封面地址', className: 'admin-field-wide' }, h('input', { value: draft.cover, onChange: (event) => updateField('cover', event.target.value) })),
    )

    const uploads = h('section', { className: 'admin-uploads', 'aria-labelledby': 'uploads-title' },
      h('h2', { id: 'uploads-title' }, '图片'),
      h('div', { className: 'admin-upload-control' },
        h(Field, { label: '上传封面' }, h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', disabled: !validSlug || Boolean(busy), onChange: uploadCover })),
        h(Status, { message: coverError, error: true }),
      ),
      h('div', { className: 'admin-upload-control' },
        h(Field, { label: '插图替代文本' }, h('input', { value: inlineAlt, onChange: (event) => setInlineAlt(event.target.value), placeholder: '描述图片内容' })),
        h(Field, { label: '上传并插入图片' }, h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', disabled: !validSlug || Boolean(busy), onChange: uploadInlineImage })),
        h(Status, { message: imageError, error: true }),
      ),
      !validSlug ? h('p', { className: 'admin-hint', role: 'status' }, '填写有效 slug 后可上传图片。') : null,
    )

    const editor = h('section', { className: 'admin-editor-pane', 'aria-labelledby': 'editor-title' },
      h('h2', { id: 'editor-title' }, 'Markdown 正文'),
      toolbar,
      h('label', { className: 'admin-sr-label', htmlFor: 'article-markdown' }, 'Markdown 正文编辑器'),
      h('textarea', { id: 'article-markdown', ref: textareaRef, value: draft.body, onChange: (event) => updateField('body', event.target.value), spellCheck: false }),
    )

    const preview = h('section', { className: 'admin-preview-pane', 'aria-labelledby': 'preview-title' },
      h('h2', { id: 'preview-title' }, '实时预览'),
      draft.cover ? h('img', { className: 'admin-preview-cover', src: draft.cover, alt: `${draft.title || '文章'}封面` }) : null,
      h(React.Suspense, { fallback: h('p', { role: 'status' }, '正在加载预览…') }, h(MarkdownArticle, { source: draft.body })),
    )

    mainContent = h('main', { className: 'admin-main' },
      h('header', { className: 'admin-page-header' },
        h('div', null, h('p', { className: 'admin-eyebrow' }, originalSlug ? '编辑文章' : '新建文章'), h('h1', null, draft.title || '未命名文章')),
        h('div', { className: 'admin-save-actions' },
          originalSlug ? h('button', { type: 'button', className: 'admin-danger-button', onClick: () => setDeletePending(true) }, '删除文章') : null,
          h('button', { type: 'button', className: 'admin-primary-button', disabled: !dirty || !validSlug || Boolean(busy), onClick: () => saveDraft(false) }, busy === 'save' ? '保存中…' : '保存文章'),
        ),
      ),
      h(Status, { message: pageError, error: true }),
      h(Status, { message: status || (dirty ? '有未保存的更改' : ''), error: false }),
      renamePending ? h('div', { className: 'admin-confirmation', role: 'alert' },
        h('p', null, `Slug 将从 “${originalSlug}” 改为 “${draft.slug}”，文章路径也会改变。`),
        h('button', { type: 'button', onClick: () => setRenamePending(false) }, '取消'),
        h('button', { type: 'button', className: 'admin-primary-button', onClick: () => saveDraft(true) }, '确认改名并保存'),
      ) : null,
      deletePending ? h('div', { className: 'admin-confirmation admin-delete-confirmation', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'delete-title' },
        h('h2', { id: 'delete-title' }, `删除《${draft.title}》`),
        h('p', null, `将永久删除文章 “${draft.title}” 及其正文文件。`),
        h('button', { type: 'button', onClick: () => setDeletePending(false) }, '取消'),
        h('button', { type: 'button', className: 'admin-danger-button', onClick: deleteArticle }, busy === 'delete' ? '删除中…' : '确认删除'),
      ) : null,
      metadata,
      uploads,
      h('div', { className: 'admin-workspace' }, editor, preview),
    )
  }

  return h('div', { className: 'article-admin-page' }, listRail, mainContent)
}

export default ArticleAdmin
