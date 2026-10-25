import { useState } from 'react'
import { buildFeedbackMailto, getFeedbackEmail } from './feedback-config.js'

export function CompetitionFeedback({ name = '竞赛列表' }) {
  const [text, setText] = useState('')
  const email = getFeedbackEmail(import.meta.env.VITE_COMPETITION_FEEDBACK_EMAIL)
  return (
    <section className="competition-panel competition-feedback" aria-labelledby="competition-feedback-title">
      <p className="section-tag">FEEDBACK</p>
      <h2 id="competition-feedback-title">纠错与建议</h2>
      {email ? <>
        <p>发现信息有误？请附上正确内容及官方来源。通过邮件联系本站：<a href={`mailto:${email}`}>{email}</a>。</p>
        <label htmlFor="competition-feedback-text">反馈内容与来源链接</label>
        <textarea id="competition-feedback-text" value={text} onChange={(event) => setText(event.target.value)} rows={4} maxLength={3000} placeholder="例如：比赛名称、需修正的节点、官方通知链接…" />
        {text.trim() ? <a className="btn btn-ghost" href={buildFeedbackMailto(email, name, text.trim(), window.location.href)}>打开邮件客户端发送</a> : <button className="btn btn-ghost" disabled>请先填写反馈内容</button>}
        <p className="competition-muted">点击只会打开邮件草稿，需在邮件客户端完成发送；本站不显示提交成功，也不会保存内容。</p>
      </> : <p role="status">本站暂未配置纠错接收渠道，当前无法在线提交。请先通过赛事详情中的官方来源核实信息，待本站开放接收渠道后再反馈。</p>}
    </section>
  )
}
