import { useEffect, useState } from 'react'
import { api } from './api'
import { statusNames, useMember } from './member-context'

function ApplicationFields({ contactRequired }) {
  return <><label>学校 / 学院<input name="school" required maxLength={200} autoComplete="organization" /></label><label>加入理由<textarea name="reason" required maxLength={3000} /></label><label>如何认识社区<input name="discovery" required maxLength={500} /></label><label>联系方式（{contactRequired ? '必填' : '选填'}）<input name="contact" required={contactRequired} maxLength={200} /></label></>
}

export function AccountPage() {
  const { user, setUser, loading, error: serviceError, refresh, logout, contactRequired } = useMember()
  const [register, setRegister] = useState(false)
  const [application, setApplication] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reapplying, setReapplying] = useState(false)
  useEffect(() => {
    let active = true
    setApplication(null)
    if (user) api('/api/me/application').then((item) => { if (active) setApplication(item) }).catch((failure) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [user])
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    const body = Object.fromEntries(new FormData(event.currentTarget))
    if ('contact' in body && !body.contact) body.contact = null
    try {
      if (reapplying) {
        await api('/api/me/application', { method: 'POST', body }); setReapplying(false); await refresh()
      } else {
        const result = await api(`/api/auth/${register ? 'register' : 'login'}`, { method: 'POST', body }); setUser(result.user)
      }
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  const exit = async () => {
    setBusy(true); setError('')
    try { await logout(); setReapplying(false) } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  if (loading) return <main className="member-page" role="status">正在加载账号…</main>
  return <main className="member-page"><p className="section-tag">COMMUNITY MEMBERSHIP</p><h1>{user ? '我的账号与申请' : register ? '注册并申请加入' : '登录 code-hive'}</h1>
    {(error || serviceError) && <p className="member-error" role="alert">{error || serviceError}</p>}
    {user ? <><section className="competition-panel"><h2>{user.display_name}</h2><p>登录名：{user.username} · 资格：{statusNames[user.membership_status]}</p>{application ? <><p>申请 #{application.id} · {statusNames[application.status]}</p><p>学校 / 学院：{application.school}</p><p>加入理由：{application.reason}</p><p>认识渠道：{application.discovery}</p><p>审核说明：{application.review_note || '等待管理员审核'}</p>{application.reviewed_at && <p>审核时间（UTC）：{application.reviewed_at}</p>}</> : <p>初始化管理员无需加入申请。</p>}
      {user.membership_status === 'suspended' && <p>成员资格已暂停，请联系社区管理员处理恢复。</p>}
      <div className="member-actions"><button className="btn btn-ghost" onClick={refresh}>刷新审核结果</button><button className="btn btn-ghost" onClick={exit} disabled={busy}>退出登录</button>{user.membership_status === 'approved' && <a className="btn btn-primary" href="#/me/competitions">我的比赛</a>}{user.membership_status === 'rejected' && <button className="btn btn-primary" onClick={() => setReapplying((value) => !value)}>重新申请</button>}</div></section>
      {reapplying && <form className="member-form competition-panel" onSubmit={submit}><h2>重新申请加入</h2><ApplicationFields contactRequired={contactRequired} /><button className="btn btn-primary" disabled={busy}>提交重新申请</button></form>}</> : <>
      <div className="member-tabs"><button className="btn btn-ghost" disabled={busy} onClick={() => { setRegister(false); setError('') }} aria-pressed={!register}>登录</button><button className="btn btn-ghost" disabled={busy} onClick={() => { setRegister(true); setError('') }} aria-pressed={register}>注册并申请</button></div>
      <form key={register ? 'register' : 'login'} className="member-form competition-panel" onSubmit={submit}><label>登录名<input name="username" required minLength={3} maxLength={64} autoComplete="username" placeholder="字母、数字、下划线、点或短横线" /></label><label>密码<input name="password" type="password" required minLength={register ? 10 : 1} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} /></label>{register && <><label>显示称呼<input name="display_name" required maxLength={80} autoComplete="nickname" /></label><ApplicationFields contactRequired={contactRequired} /><p>注册会同时提交加入申请，获批后可收藏和订阅。</p></>}<button className="btn btn-primary" disabled={busy}>{busy ? '正在提交…' : register ? '注册并提交申请' : '登录'}</button></form><p className="competition-muted">账号恢复与密码找回方式尚待确定，当前未开放在线找回。</p></>}
  </main>
}
