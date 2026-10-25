import { useEffect, useState } from 'react'
import { api } from './api'
import { CompetitionActions } from './CompetitionActions'
import { MemberGate } from './MemberContext'
import { useMember } from './member-context'

function MyList() {
  const { user } = useMember()
  const [kind, setKind] = useState('all')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    api(`/api/me/competitions?kind=${kind}&offset=${offset}&limit=20`, { signal: controller.signal }).then((result) => { setItems(result.items); setTotal(result.total) }).catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [kind, offset, revision, user])
  return <main className="member-page"><p className="section-tag">MY COMPETITIONS</p><h1>我的比赛</h1><p>收藏和订阅分别保存。订阅记录更新意愿，自动提醒尚未上线。</p><div className="member-tabs">{[['all', '全部'], ['favorites', '已收藏'], ['subscriptions', '已订阅']].map(([value, label]) => <button key={value} className="btn btn-ghost" aria-pressed={kind === value} onClick={() => { setKind(value); setOffset(0) }}>{label}</button>)}</div>
    {loading ? <p role="status">正在加载比赛…</p> : error ? <p role="alert">{error}<button className="btn btn-ghost" onClick={() => setRevision((value) => value + 1)}>重试</button></p> : items.length ? <div className="competition-grid">{items.map((item) => <article className="competition-card" key={item.competition.id}><h2><a href={`#/competitions/${item.competition.slug}`}>{item.competition.name}</a></h2><p>{item.competition.year} · {item.competition.edition} · {item.competition.publicationStatus === 'archived' ? '已归档' : item.competition.status}</p><p>{item.competition.summary}</p><p>{item.favorite ? '已收藏' : '未收藏'} · {item.subscribed ? '已订阅' : '未订阅'}</p><CompetitionActions competitionId={item.competition.id} initial={item} onChange={() => setRevision((value) => value + 1)} /></article>)}</div> : <section className="competition-empty"><h2>这里还没有比赛</h2><a href="#/competitions">去公开竞赛专区看看</a></section>}
    <div className="member-actions"><button className="btn btn-ghost" disabled={!offset || loading} onClick={() => setOffset(Math.max(0, offset - 20))}>上一页</button><span>{total} 项比赛</span><button className="btn btn-ghost" disabled={offset + 20 >= total || loading} onClick={() => setOffset(offset + 20)}>下一页</button></div>
  </main>
}

export function MyCompetitions() { return <MemberGate><MyList /></MemberGate> }
