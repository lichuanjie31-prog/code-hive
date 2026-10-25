import { useCallback, useEffect, useState } from 'react'
import { api, initializeCsrf, resetCsrf } from './api'
import './member.css'

import { MemberContext, useMember, statusNames } from './member-context'

export function MemberProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [contactRequired, setContactRequired] = useState(false)
  const refresh = useCallback(async () => {
    try {
      const config = await initializeCsrf()
      setContactRequired(config.contact_required)
      setUser(await api('/api/me'))
      setError('')
    } catch (failure) {
      setUser(null)
      setError(failure.status === 401 ? '' : '账号服务暂时不可用，请确认后端已启动')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => {
    refresh()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' })
    resetCsrf(); setUser(null); window.location.hash = '#/account'
  }
  return <MemberContext.Provider value={{ user, setUser, loading, error, refresh, logout, contactRequired }}>{children}</MemberContext.Provider>
}

export function MemberNav() {
  const { user } = useMember()
  return <><a href="#/me/competitions">我的比赛</a><a href="#/account">{user ? user.display_name : '登录 / 加入'}</a>{user?.role === 'admin' && user.membership_status === 'approved' && <a href="#/admin/membership">成员审核</a>}</>
}

export function MemberGate({ children, admin = false }) {
  const { user, loading, error, refresh } = useMember()
  if (loading) return <main className="member-page" role="status">正在检查登录状态…</main>
  if (error) return <main className="member-page"><p role="alert">{error}</p><button className="btn btn-ghost" onClick={refresh}>重新连接</button></main>
  if (!user) return <main className="member-page"><h1>登录后查看</h1><a className="btn btn-primary" href="#/account">登录 / 注册并申请</a></main>
  if (user.membership_status !== 'approved') return <main className="member-page"><h1>成员资格：{statusNames[user.membership_status]}</h1><p>获批成员可以收藏与订阅比赛。</p><a href="#/account">查看申请结果</a></main>
  if (admin && user.role !== 'admin') return <main className="member-page"><h1>需要管理员权限</h1><a href="#/competitions">浏览公开比赛</a></main>
  return children
}
