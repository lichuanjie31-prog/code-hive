import { useEffect, useState } from 'react'
import { api } from './api'
import { MemberGate } from './MemberContext'
import { statusNames } from './member-context'

function AdminPanel() {
  const [tab, setTab] = useState('pending')
  const [items, setItems] = useState([])
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const controller = new AbortController(); setError(''); setLoading(true)
    api(tab === 'members' ? `/api/admin/members?offset=${offset}&limit=20` : `/api/admin/applications?status=${tab}&offset=${offset}&limit=20`, { signal: controller.signal }).then(setItems).catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [tab, offset, revision])
  const act = async (event, item, action) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const note = new FormData(event.currentTarget).get('note')
    try {
      const review = ['approved', 'rejected'].includes(action)
      await api(review ? `/api/admin/applications/${item.id}/review` : `/api/admin/members/${item.id}/${action}`, { method: 'POST', body: review ? { decision: action, note } : { reason: note } })
      setNotice('操作已保存'); setRevision((value) => value + 1)
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  return <main className="member-page"><p className="section-tag">ADMINISTRATION</p><h1>成员审核与资格管理</h1><div className="member-tabs">{[['pending', '待审核'], ['approved', '已批准'], ['rejected', '已拒绝'], ['members', '成员资格']].map(([value, label]) => <button key={value} className="btn btn-ghost" aria-pressed={tab === value} disabled={busy} onClick={() => { setTab(value); setOffset(0) }}>{label}</button>)}</div>{error && <p className="member-error" role="alert">{error}<button className="btn btn-ghost" onClick={() => setRevision((value) => value + 1)}>刷新列表</button></p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">正在加载…</p> : !items.length ? <p>当前没有记录。</p> : items.map((item) => <section className="competition-panel" key={item.id}><h2>{tab === 'members' ? item.display_name : item.applicant.display_name}</h2>{tab === 'members' ? <><p>{item.username} · {item.role} · {statusNames[item.membership_status]}</p><form className="member-form" onSubmit={(event) => act(event, item, item.membership_status === 'suspended' ? 'restore' : 'suspend')}><label>操作原因<textarea name="note" required maxLength={3000} /></label><button className="btn btn-ghost" disabled={busy}>{item.membership_status === 'suspended' ? '恢复资格' : '暂停资格'}</button></form></> : <><p>申请 #{item.id} · {item.applicant.username} · {statusNames[item.status]}</p><dl><dt>学校 / 学院</dt><dd>{item.school}</dd><dt>加入理由</dt><dd>{item.reason}</dd><dt>认识渠道</dt><dd>{item.discovery}</dd><dt>联系方式</dt><dd>{item.contact || '未填写'}</dd><dt>审核说明</dt><dd>{item.review_note || '待审核'}</dd></dl>{item.status === 'pending' && <form className="member-form" onSubmit={(event) => act(event, item, event.nativeEvent.submitter.value)}><label>审核说明<textarea name="note" required maxLength={3000} /></label><div className="member-actions"><button className="btn btn-primary" value="approved" disabled={busy}>批准申请</button><button className="btn btn-ghost" value="rejected" disabled={busy}>拒绝申请</button></div></form>}</>}</section>)}
    <div className="member-actions"><button className="btn btn-ghost" disabled={!offset || loading || busy} onClick={() => setOffset(Math.max(0, offset - 20))}>上一页</button><button className="btn btn-ghost" disabled={items.length < 20 || loading || busy} onClick={() => setOffset(offset + 20)}>下一页</button></div>
  </main>
}

export function AdminMembership() { return <MemberGate admin><AdminPanel /></MemberGate> }
