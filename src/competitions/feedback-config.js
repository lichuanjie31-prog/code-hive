// 仅配置本站接收渠道，不能使用赛事组委会邮箱接收本站纠错。
// VITE_COMPETITION_FEEDBACK_EMAIL 是公开联系邮箱，不得填写私密凭证。
export function getFeedbackEmail(value = '') {
  const email = value.trim()
  return /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email) ? email : null
}

export function buildFeedbackMailto(email, name, text, pageUrl) {
  return `mailto:${email}?subject=${encodeURIComponent(`竞赛专区纠错 / 建议：${name}`)}&body=${encodeURIComponent(`比赛：${name}\n页面：${pageUrl}\n\n${text}`)}`
}
