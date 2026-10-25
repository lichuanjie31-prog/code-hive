import { useEffect, useState } from 'react'
import { CompetitionFeedback } from './CompetitionFeedback'
import { getCompetitionFilters, getSources, getTimeline, listCompetitions, loadCompetitions, loadCompetition } from './competition-repository'
import { CompetitionActions } from '../member/CompetitionActions'
import './competitions.css'

function SourceLinks({ ids, sources }) {
  return <span className="competition-source-links">{getSources(sources, ids).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</span>
}

function useCompetitionData(slug) {
  const [data, setData] = useState(slug === undefined ? [] : null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null)
    const request = slug === undefined ? loadCompetitions(controller.signal) : loadCompetition(slug, controller.signal)
    request.then(setData).catch((failure) => { if (failure.name !== 'AbortError') setError(failure) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [slug, retry])
  return { data, loading, error, retry: () => setRetry((value) => value + 1) }
}

function DataState({ loading, error, retry }) {
  return <main className="member-page">{loading ? <p role="status">正在加载比赛资料…</p> : <><h1>比赛资料暂时无法加载</h1><p role="alert">{error?.message || '请检查服务连接'}</p><button className="btn btn-ghost" onClick={retry}>重新加载</button></>}</main>
}

function Tags({ values }) {
  return <div className="competition-tags">{values.map((value) => <span key={value}>{value}</span>)}</div>
}

export function CompetitionList() {
  const { data, loading, error, retry } = useCompetitionData()
  const [query, setQuery] = useState('')
  const [direction, setDirection] = useState('')
  const [status, setStatus] = useState('')
  const filters = getCompetitionFilters(data)
  const items = listCompetitions(data, { query, direction, status })
  const reset = () => { setQuery(''); setDirection(''); setStatus('') }
  if (loading || error) return <DataState loading={loading} error={error} retry={retry} />
  return (
    <main className="competitions-page">
      <header className="competition-intro">
        <p className="section-tag">CAMPUS COMPETITIONS</p>
        <h1>让技术，走向<span className="gradient-text">比赛现场</span></h1>
        <p>校园竞赛资讯专区 · 找方向、读要求、看赛程，从一个适合自己的项目开始。</p>
        <div className="competition-intro-meta"><span>公开浏览 · 无须登录</span><span>首批 3 项赛事</span><span>资料核验：2026-10-04</span></div>
      </header>
      <aside className="competition-notice">当前整理的是 2026 届资料，用于了解比赛与回顾赛程。下一届信息待公布；报名状态、学校选拔和赛题要求请以最新官方通知为准。</aside>
      <section aria-label="比赛筛选" className="competition-filters">
        <label>搜索比赛<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称、简介或技术方向" /></label>
        <label>技术方向<select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="">全部方向</option>{filters.directions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>资料状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{filters.statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
        <button type="button" className="btn btn-ghost" onClick={reset}>重置筛选</button>
      </section>
      <p className="competition-result-count" role="status" aria-live="polite">找到 {items.length} 项比赛</p>
      {items.length ? <div className="competition-grid">{items.map((item) => <article className="competition-card" key={item.id}>
        <div className="competition-card-top"><span>{item.shortName}</span><span className="competition-status">{item.status}</span></div>
        <p className="competition-muted">{item.year} · {item.edition}</p>
        <h2><a href={`#/competitions/${item.slug}`}>{item.name}</a></h2>
        <p>{item.summary}</p>
        <Tags values={item.directions} />
        <a className="competition-card-link" href={`#/competitions/${item.slug}`}>查看要求与时间轴 <span aria-hidden="true">→</span></a>
      </article>)}</div> : <div className="competition-empty"><h2>暂时没有匹配的比赛</h2><p>试试其他关键词，或清除方向和资料状态筛选。</p><button type="button" className="btn btn-ghost" onClick={reset}>查看全部比赛</button></div>}
      <CompetitionFeedback />
    </main>
  )
}

function CompetitionTimeline({ competition }) {
  const [trackId, setTrackId] = useState('')
  const events = getTimeline(competition, trackId)
  return <section className="competition-panel" aria-labelledby="competition-timeline-title">
    <p className="section-tag">TIMELINE</p><h2 id="competition-timeline-title">时间轴</h2>
    <p className="competition-muted">已公布时刻按通知保留；仅有日期的节点不补截止时刻。全国、区域与校内安排分别标注。</p>
    <label className="competition-track-filter">按赛道查看<select value={trackId} onChange={(event) => setTrackId(event.target.value)}><option value="">全部赛道</option>{competition.tracks.map((track) => <option value={track.id} key={track.id}>{track.name}</option>)}</select></label>
    <ol className="competition-timeline">{events.map((event) => <li key={event.id}>
      <div className="competition-event-meta"><span>{event.scope}</span><span>{event.certainty}</span></div>
      <h3>{event.name}</h3><p className="competition-date">{event.dateText || event.certainty || '待确认'}</p>
      <p className="competition-muted">{event.trackIds.length ? event.trackIds.map((id) => competition.tracks.find((track) => track.id === id)?.name).filter(Boolean).join(' / ') : '全赛道 / 通用节点'}</p>
      {event.note && <p>{event.note}</p>}<SourceLinks ids={event.sourceIds} sources={competition.sources} />
    </li>)}</ol>
  </section>
}

export function CompetitionDetail({ slug }) {
  const { data: competition, loading, error, retry } = useCompetitionData(slug)
  if (loading || (error && error.status !== 404)) return <DataState loading={loading} error={error} retry={retry} />
  if (!competition) return <main className="article-state"><p className="section-tag">404 · COMPETITION NOT FOUND</p><h1>未找到这项比赛</h1><p>地址可能有误，或赛事尚未收录。</p><a href="#/competitions" className="btn btn-primary">返回竞赛专区</a></main>
  return <main className="competitions-page competition-detail">
    <a href="#/competitions" className="article-back">← 返回全部比赛</a>
    <header className="competition-intro"><p className="section-tag">{competition.year} · {competition.edition}</p><h1>{competition.name}</h1><p>{competition.summary}</p><Tags values={competition.directions} /><div className="competition-intro-meta"><span>{competition.status}</span><span>适用年份：{competition.year}</span><span>核验：{competition.checkedAt}</span></div></header>
    <aside className="competition-notice">{competition.notice}</aside>
    <CompetitionActions competitionId={competition.id} />
    <div className="competition-detail-grid">
      <section className="competition-panel"><p className="section-tag">OFFICIAL REQUIREMENTS</p><h2>官方要求摘要</h2><dl><dt>主办 / 组织方</dt><dd>{competition.organizer || '待确认'}<SourceLinks ids={[competition.organizerSourceId]} sources={competition.sources} /></dd><dt>参赛资格</dt><dd>{competition.eligibility || '待确认'}</dd><dt>参赛团队</dt><dd>{competition.team || '待确认'}</dd><dt>作品要求</dt><dd><ul>{competition.requirements.map((item) => <li key={item}>{item}</li>)}</ul></dd></dl><SourceLinks ids={competition.officialSourceIds} sources={competition.sources} /></section>
      <section className="competition-panel competition-analysis"><p className="section-tag">CODE-HIVE ANALYSIS</p><h2>适合哪些同学？</h2><p className="competition-muted">以下为本站分析，不是官方资格限制或评分标准。</p><dl><dt>专业与背景</dt><dd>{competition.analysis.majors}</dd><dt>建议技能</dt><dd>{competition.analysis.skills}</dd><dt>选择建议</dt><dd>{competition.analysis.fit}</dd></dl></section>
    </div>
    <section className="competition-panel"><p className="section-tag">TRACKS</p><h2>赛道与作品准备</h2><div className="competition-track-grid">{competition.tracks.map((track) => <article key={track.id}><h3>{track.name}</h3><p>{track.requirements || '作品要求待确认'}</p><SourceLinks ids={track.sourceIds} sources={competition.sources} /></article>)}</div></section>
    <CompetitionTimeline key={competition.id} competition={competition} />
    <section className="competition-panel"><p className="section-tag">OFFICIAL LINKS</p><h2>官方通知与报名</h2><div className="competition-actions"><a className="btn btn-primary" href={competition.links.official} target="_blank" rel="noreferrer">赛事官方网站 ↗</a>{competition.links.registration ? <a className="btn btn-ghost" href={competition.links.registration} target="_blank" rel="noreferrer">{competition.links.registrationLabel} ↗</a> : <p>报名地址待确认，请先联系校内竞赛负责人，按校赛、省赛推荐流程参赛。</p>}</div><p className="competition-muted">外部链接由赛事方维护。以上入口不表示当届正在接受报名。</p><ul className="competition-source-list">{getSources(competition.sources, competition.sourceIds).map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><span>{source.kind}{source.publishedAt ? ` · ${source.publishedAt}` : ''}</span></li>)}</ul></section>
    <CompetitionFeedback key={competition.id} name={competition.name} />
  </main>
}
