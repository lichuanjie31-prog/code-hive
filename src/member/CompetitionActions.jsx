import { useEffect, useState } from 'react'
import { api } from './api'
import { useMember } from './member-context'

export function CompetitionActions({ competitionId, initial, onChange }) {
  const { user, loading, refresh } = useMember()
  const [state, setState] = useState(initial || { favorite: false, subscribed: false })
  const [ready, setReady] = useState(Boolean(initial))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    if (initial) { setState(initial); setReady(true); return }
    setReady(false)
    if (user?.membership_status === 'approved') {
      const load = async () => {
        let offset = 0
        while (true) {
          const result = await api(`/api/me/competitions?offset=${offset}`)
          const entry = result.items.find((item) => item.competition.id === competitionId)
          if (entry || offset + result.items.length >= result.total) {
            if (active) { setState(entry || { favorite: false, subscribed: false }); setReady(true); setError('') }
            break
          }
          offset += result.items.length
        }
      }
      load().catch((failure) => { if (active) setError(failure.message) })
    }
    return () => { active = false }
  }, [user, competitionId, initial, retry])
  const toggle = async (kind) => {
    setBusy(true); setError('')
    const field = kind === 'favorites' ? 'favorite' : 'subscribed'
    try {
      await api(`/api/me/${kind}/${encodeURIComponent(competitionId)}`, { method: state[field] ? 'DELETE' : 'PUT' })
      const next = { ...state, [field]: !state[field] }
      setState(next); onChange?.(next)
    } catch (failure) { setError(failure.message); if ([401, 403].includes(failure.status)) await refresh() } finally { setBusy(false) }
  }
  return <section className="member-competition-actions" aria-label="收藏与订阅">
    {loading ? <p role="status">正在检查成员状态…</p> : user?.membership_status === 'approved' ? <div className="member-actions"><button className="btn btn-ghost" disabled={busy || !ready} aria-pressed={state.favorite} onClick={() => toggle('favorites')}>{state.favorite ? '取消收藏' : '收藏比赛'}</button><div><button className="btn btn-ghost" disabled={busy || !ready} aria-pressed={state.subscribed} onClick={() => toggle('subscriptions')}>{state.subscribed ? '取消订阅' : '订阅比赛'}</button><span className="member-reminder">自动提醒尚未上线</span></div></div> : <p><a href="#/account">{user ? '查看成员资格' : '登录并申请加入'}</a>，获批后可收藏与订阅。<span className="member-reminder">自动提醒尚未上线</span></p>}
    {error && <p className="member-error" role="alert">{error}{!ready && <button className="btn btn-ghost" onClick={() => setRetry((value) => value + 1)}>重试</button>}</p>}
  </section>
}
