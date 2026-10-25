import { competitions, competitionSources } from '../data/competitions.js'

// 页面只通过此接口读数据；未来可在这里替换成 API，互动数据以 competition.id 关联。
export function listCompetitions({ query = '', direction = '', status = '' } = {}) {
  const term = query.trim().toLocaleLowerCase()
  return competitions.filter((item) =>
    (!direction || item.directions.includes(direction)) &&
    (!status || item.status === status) &&
    (!term || [item.name, item.shortName, item.summary, ...item.directions].join(' ').toLocaleLowerCase().includes(term)),
  )
}

export function getCompetitionBySlug(slug) {
  return competitions.find((item) => item.slug === slug) ?? null
}

export function getCompetitionFilters() {
  return {
    directions: [...new Set(competitions.flatMap((item) => item.directions))],
    statuses: [...new Set(competitions.map((item) => item.status))],
  }
}

export function getSources(ids = []) {
  return ids.map((id) => ({ id, ...competitionSources[id] })).filter((source) => source.url)
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
