import { useEffect, useState } from 'react'
import { articleSlugFromHash, articles, findArticleBySlug } from './data/articles'
import { site, categories, resources } from './data/resources'
import './App.css'

const markdownFiles = import.meta.glob('./content/articles/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
})

// 六边形装饰（hive = 蜂巢）
function Hex({ size = 20, className = '' }) {
  return (
    <svg
      className={`hex ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M12 1.5 21.1 6.75 v10.5 L12 22.5 2.9 17.25 V6.75 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}

function Navbar() {
  return (
    <header className="navbar">
      <a className="brand" href="#top">
        <Hex size={22} className="brand-hex" />
        <span>
          code<span className="brand-accent">-hive</span>
        </span>
      </a>
      <nav className="nav-links">
        <a href="#about">关于社区</a>
        <a href="#articles">精选文章</a>
        <a href="#resources">资源蜂巢</a>
        <a className="nav-domain" href="#top">
          {site.domain}
        </a>
      </nav>
    </header>
  )
}

function Articles() {
  return (
    <section className="articles" id="articles">
      <div className="section-head">
        <p className="section-tag">
          <Hex size={14} /> EDITOR&apos;S PICKS
        </p>
        <h2 className="section-title">精选文章</h2>
        <p className="section-desc">从一次能做完的行动开始，把技术学习落到作品和证据里。</p>
      </div>
      <div className="article-grid">
        {articles.map((article) => (
          <article className="article-card" key={article.slug}>
            <img src={article.cover} alt={`${article.title}封面`} />
            <div className="article-card-body">
              <time dateTime={article.date}>{article.date}</time>
              <h3>{article.title}</h3>
              <p>{article.summary}</p>
              <a href={`#/articles/${article.slug}`}>阅读全文 <span aria-hidden="true">→</span></a>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function InlineMarkdown({ text }) {
  const parts = text.split(/(!\[[^\]]+\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|`[^`]+`)/g)
  return parts.map((part, index) => {
    const image = /^!\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (image) return <img className="article-inline-image" src={image[2]} alt={image[1]} key={`${part}-${index}`} />
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part)
    if (link) return <a href={link[2]} target="_blank" rel="noreferrer" key={`${part}-${index}`}>{link[1]}</a>
    const code = /^`([^`]+)`$/.exec(part)
    if (code) return <code key={`${part}-${index}`}>{code[1]}</code>
    return part
  })
}

function MarkdownArticle({ source }) {
  const blocks = []
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  let paragraph = []
  let list = []
  let code = []
  let language = ''
  let inCode = false

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list })
    list = []
  }

  lines.forEach((line) => {
    if (line.startsWith('```')) {
      flushParagraph()
      flushList()
      if (inCode) {
        blocks.push({ type: 'code', text: code.join('\n'), language })
        code = []
        language = ''
      } else {
        language = line.slice(3).trim()
      }
      inCode = !inCode
      return
    }
    if (inCode) {
      code.push(line)
      return
    }
    if (!line.trim()) {
      flushParagraph()
      flushList()
      return
    }
    if (line.startsWith('## ')) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', text: line.slice(3) })
      return
    }
    if (/^[-*] /.test(line)) {
      flushParagraph()
      list.push(line.slice(2))
      return
    }
    if (line.startsWith('> ')) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'quote', text: line.slice(2) })
      return
    }
    if (/^!\[[^\]]+\]\([^)]+\)$/.test(line)) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'image', text: line })
      return
    }
    paragraph.push(line)
  })
  flushParagraph()
  flushList()

  return (
    <div className="markdown-body">
      {blocks.map((block, index) => {
        if (block.type === 'heading') return <h2 key={index}>{block.text}</h2>
        if (block.type === 'quote') return <blockquote key={index}><InlineMarkdown text={block.text} /></blockquote>
        if (block.type === 'code') return <pre key={index} data-language={block.language}><code>{block.text}</code></pre>
        if (block.type === 'list') return <ul key={index}>{block.items.map((item) => <li key={item}><InlineMarkdown text={item} /></li>)}</ul>
        if (block.type === 'image') return <div className="article-figure" key={index}><InlineMarkdown text={block.text} /></div>
        return <p key={index}><InlineMarkdown text={block.text} /></p>
      })}
    </div>
  )
}

function ArticlePage({ slug }) {
  const article = findArticleBySlug(slug)
  if (!article) {
    return (
      <main className="article-state">
        <Hex size={56} />
        <p className="section-tag">404 · ARTICLE NOT FOUND</p>
        <h1>这篇文章还没有进入蜂巢</h1>
        <p>链接可能已经失效，也可能是地址输入有误。</p>
        <a className="btn btn-primary" href="#top">返回首页</a>
      </main>
    )
  }

  const markdownKey = `./content/articles/${article.slug}.md`
  const source = markdownFiles[markdownKey]
  return (
    <>
      <Navbar />
      <main className="article-page">
        <a className="article-back" href="#articles">← 返回精选文章</a>
        <article>
          <header className="article-header">
            <p className="section-tag"><Hex size={14} /> FEATURED ARTICLE</p>
            <h1>{article.title}</h1>
            <p>{article.summary}</p>
            <div className="article-meta"><span>{article.author}</span><time dateTime={article.date}>{article.date}</time></div>
            <img src={article.cover} alt={`${article.title}封面`} />
          </header>
          {source ? <MarkdownArticle source={source} /> : <p className="article-load-error">文章内容暂时无法加载。</p>}
        </article>
      </main>
      <Footer />
    </>
  )
}

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-bg" aria-hidden="true">
        <div className="glow glow-a" />
        <div className="glow glow-b" />
        <div className="hex-field">
          <Hex size={90} className="float-hex h1" />
          <Hex size={46} className="float-hex h2" />
          <Hex size={140} className="float-hex h3" />
          <Hex size={30} className="float-hex h4" />
        </div>
      </div>
      <div className="hero-inner">
        <p className="hero-tag">
          <Hex size={14} /> 大学生技术社区 · 少走弯路
        </p>
        <h1 className="hero-title">
          code<span className="gradient-text">-hive</span>
        </h1>
        <p className="hero-slogan">{site.slogan}</p>
        <p className="hero-sub">
          我们把亲测好用的学习网站整理进蜂巢，开箱即取，把时间花在真正有用的学习上。
        </p>
        <div className="hero-actions">
          <a className="btn btn-primary" href="#resources">
            进入资源蜂巢
          </a>
          <a className="btn btn-ghost" href="#about">
            了解社区
          </a>
        </div>
        <p className="hero-domain">{site.domain}</p>
      </div>
    </section>
  )
}

function About() {
  const stats = [
    { num: resources.length, label: '精选资源' },
    { num: categories.length, label: '学习方向' },
    { num: '100%', label: '亲测推荐' },
  ]
  return (
    <section className="about" id="about">
      <div className="section-head">
        <p className="section-tag">
          <Hex size={14} /> ABOUT
        </p>
        <h2 className="section-title">关于 code-hive</h2>
      </div>
      <p className="about-text">{site.intro}</p>
      <div className="stats">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <span className="stat-num gradient-text">{s.num}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Resources() {
  return (
    <section className="resources" id="resources">
      <div className="section-head">
        <p className="section-tag">
          <Hex size={14} /> RESOURCES
        </p>
        <h2 className="section-title">资源蜂巢</h2>
        <p className="section-desc">
          按学习方向分格收纳，点卡片直达网站。数据统一维护在
          <code> src/data/resources.js</code>。
        </p>
      </div>
      {categories.map((cat) => {
        const items = resources.filter((r) => r.category === cat.id)
        if (items.length === 0) return null
        return (
          <div className="cat-block" key={cat.id}>
            <h3 className="cat-title">
              <Hex size={18} className="cat-hex" />
              {cat.label}
              <span className="cat-count">{items.length}</span>
            </h3>
            <div className="card-grid">
              {items.map((r) => (
                <a
                  className="card"
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  key={r.url}
                >
                  <div className="card-top">
                    <span className="card-name">{r.name}</span>
                    <span className="card-arrow">↗</span>
                  </div>
                  <p className="card-desc">{r.desc}</p>
                  <span className="card-url">
                    {r.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <p className="footer-brand">
          <Hex size={16} /> code-hive 技术社区
        </p>
        <p className="footer-note">
          让更多人少走弯路 · {site.domain} · 数据见 src/data/resources.js
        </p>
      </div>
    </footer>
  )
}

function App() {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', updateHash)
    return () => window.removeEventListener('hashchange', updateHash)
  }, [])

  const articleRoute = hash.startsWith('#/articles/')
  if (articleRoute) return <div className="page"><ArticlePage slug={articleSlugFromHash(hash)} /></div>

  return (
    <div className="page">
      <Navbar />
      <main>
        <Hero />
        <About />
        <Articles />
        <Resources />
      </main>
      <Footer />
    </div>
  )
}

export default App
