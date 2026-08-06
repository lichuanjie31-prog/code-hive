import { site, categories, resources } from './data/resources'
import './App.css'

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
        <a href="#resources">资源蜂巢</a>
        <a className="nav-domain" href="#top">
          {site.domain}
        </a>
      </nav>
    </header>
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
  return (
    <div className="page">
      <Navbar />
      <main>
        <Hero />
        <About />
        <Resources />
      </main>
      <Footer />
    </div>
  )
}

export default App
