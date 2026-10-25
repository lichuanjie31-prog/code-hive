import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const { competitions, competitionSources } = JSON.parse(readFileSync(new URL('../backend/seed/competitions-v1.json', import.meta.url), 'utf8'))
import { competitionRouteFromHash, getCompetitionBySlug, getSources, getTimeline, listCompetitions } from '../src/competitions/competition-repository.js'
import { buildFeedbackMailto, getFeedbackEmail } from '../src/competitions/feedback-config.js'

test('竞赛、赛道与事件 ID 全局唯一，页面地址独立', () => {
  const ids = competitions.flatMap((item) => [item.id, ...item.tracks.map((track) => track.id), ...item.timeline.map((event) => event.id)])
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(competitions.map((item) => item.slug)).size, competitions.length)
  for (const competition of competitions) {
    assert.notEqual(competition.id, competition.slug)
    assert.notEqual(competition.id, competition.name)
    assert.match(competition.slug, /^[a-z0-9-]+$/)
    const trackIds = competition.tracks.map((track) => track.id)
    for (const event of competition.timeline) {
      event.trackIds.forEach((id) => assert.ok(trackIds.includes(id), `${event.id} 引用了未知赛道`))
    }
  }
})

test('官方事实与时间节点来源可解析，未知时间不伪造', () => {
  assert.equal(competitions.length, 3)
  for (const competition of competitions) {
    const ids = [competition.organizerSourceId, ...competition.sourceIds, ...competition.officialSourceIds, ...competition.tracks.flatMap((track) => track.sourceIds), ...competition.timeline.flatMap((event) => event.sourceIds)]
    ids.forEach((id) => assert.ok(competitionSources[id], `缺少来源 ${id}`))
    getSources(competitionSources, ids).forEach((source) => assert.match(source.url, /^https:\/\//))
    competition.timeline.filter((event) => event.dateText).forEach((event) => assert.ok(event.sourceIds.length, `${event.id} 日期没有来源`))
    competition.timeline.filter((event) => !event.dateText).forEach((event) => assert.match(event.certainty, /待确认|待公布/))
    assert.ok(competition.analysis.majors && competition.analysis.skills)
    assert.equal(competition.year, 2026)
  }
  assert.equal(getCompetitionBySlug(competitions, 'computer-design').links.registration, null)
})

test('关键修订：服创用延期时间、软件杯保留不确定性、计算机设计日期不补时刻', () => {
  const service = getCompetitionBySlug(competitions, 'service-outsourcing')
  assert.equal(service.timeline.find((event) => event.id === 'evt-service-registration').dateText, '2026-03-31 16:00')
  assert.match(service.timeline.find((event) => event.id === 'evt-service-ad-submit').dateText, /2026-04-22 16:00/)
  const soft = getCompetitionBySlug(competitions, 'software-cup')
  assert.match(soft.timeline.find((event) => event.id === 'evt-soft-registration').certainty, /待确认/)
  const design = getCompetitionBySlug(competitions, 'computer-design')
  assert.equal(design.timeline.find((event) => event.id === 'evt-design-software-final').dateText, '2026-08-11 至 2026-08-15')
})

test('搜索与组合筛选、清空筛选及无结果', () => {
  assert.equal(listCompetitions(competitions, { query: '  软件杯 ' })[0].id, 'cmp-soft-cup')
  assert.equal(listCompetitions(competitions, { query: '服创' }).length, 1)
  assert.equal(listCompetitions(competitions, { direction: '物联网', status: '本届已结束' })[0].id, 'cmp-computer-design')
  assert.equal(listCompetitions(competitions, { direction: '物联网', status: '资料待确认' }).length, 0)
  assert.equal(listCompetitions(competitions, { query: '不存在的比赛' }).length, 0)
  assert.equal(listCompetitions(competitions).length, 3)
})

test('赛道时间轴包括通用节点且排除其他赛道，C 类不出现区域赛', () => {
  const service = getCompetitionBySlug(competitions, 'service-outsourcing')
  const events = getTimeline(service, 'trk-service-c')
  assert.ok(events.some((event) => event.id === 'evt-service-registration'))
  assert.ok(events.some((event) => event.id === 'evt-service-bc-submit'))
  assert.ok(!events.some((event) => event.id === 'evt-service-ad-submit' || event.scope === '区域赛'))
})

test('路由保留现有锚点，异常编码及未知详情安全处理', () => {
  assert.deepEqual(competitionRouteFromHash('#/competitions'), { type: 'list' })
  assert.deepEqual(competitionRouteFromHash('#/competitions/software-cup'), { type: 'detail', slug: 'software-cup' })
  for (const hash of ['#top', '#about', '#articles', '#resources', '#/articles/example', '#/admin/articles']) assert.equal(competitionRouteFromHash(hash), null)
  assert.equal(getCompetitionBySlug(competitions, 'missing'), null)
  assert.equal(competitionRouteFromHash('#/competitions/%E0%A4%A').slug, null)
  assert.equal(getCompetitionBySlug(competitions, competitionRouteFromHash('#/competitions/software-cup/unknown').slug), null)
})

test('缺少或无效反馈邮箱保持未配置，邮件正文正确转义', () => {
  for (const value of [undefined, '', 'fake', 'person@example.com?bcc=other', 'a\nb@example.com']) assert.equal(getFeedbackEmail(value), null)
  assert.equal(getFeedbackEmail(' editor@example.com '), 'editor@example.com')
  const url = new URL(buildFeedbackMailto('editor@example.com', '软件杯', '纠错 & 来源\nhttps://example.com/', 'https://site.test/#/competitions/software-cup'))
  assert.equal(url.protocol, 'mailto:')
  assert.match(url.searchParams.get('body'), /纠错 & 来源\nhttps:\/\/example.com\//)
  assert.equal(url.searchParams.get('subject'), '竞赛专区纠错 / 建议：软件杯')
})
