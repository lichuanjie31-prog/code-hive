import { api } from '../member/api.js'

// 比赛事实统一通过后端 API 读取；这里保留纯筛选与路由工具。
export function listCompetitions(competitions, { query = '', direction = '', status = '' } = {}) {
  const term = query.trim().toLocaleLowerCase()
  return competitions.filter((item) =>
    (!direction || item.directions.includes(direction)) &&
    (!status || item.status === status) &&
    (!term || [item.name, item.shortName, item.summary, ...item.directions].join(' ').toLocaleLowerCase().includes(term)),
  )
}

export function getCompetitionBySlug(competitions, slug) {
  return competitions.find((item) => item.slug === slug) ?? null
}

export function getCompetitionFilters(competitions) {
  return {
    directions: [...new Set(competitions.flatMap((item) => item.directions))],
    statuses: [...new Set(competitions.map((item) => item.status))],
  }
}

export function getSources(competitionSources, ids = []) {
  return ids.map((id) => ({ id, ...competitionSources[id] })).filter((source) => source.url)
}

export async function loadCompetitions(signal) {
  const items = []
  let result
  do {
    result = await api(`/api/competitions?offset=${items.length}`, { signal })
    items.push(...result.items)
  } while (items.length < result.total && result.items.length)
  return items
}

export function loadCompetition(slug, signal) {
  return api(`/api/competitions/${encodeURIComponent(slug)}`, { signal })
}

export function getTimeline(competition, trackId = '') {
  return competition.timeline.filter((event) => !trackId || !event.trackIds.length || event.trackIds.includes(trackId))
}

export function competitionRouteFromHash(hash) {
  if (hash === '#/competitions' || hash === '#/competitions/') return { type: 'list' }
  if (!hash.startsWith('#/competitions/')) return null
  try {
    return { type: 'detail', slug: decodeURIComponent(hash.slice('#/competitions/'.length)) }
  } catch {
    return { type: 'detail', slug: null }
  }
}
