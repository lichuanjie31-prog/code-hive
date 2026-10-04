// 无额外依赖的 Chromium 实际页面检查；浏览器仅使用临时独立 profile。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const browserPath = process.env.COMPETITION_TEST_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.COMPETITION_TEST_URL || 'http://127.0.0.1:5173/'
const outputDir = process.argv[2] || path.join(tmpdir(), 'codehive-competition-qa')
const profile = await mkdtemp(path.join(tmpdir(), 'codehive-browser-'))
const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
let socket
try {
  const endpoint = await new Promise((resolve, reject) => {
    let logs = ''
    const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 20000)
    browser.once('error', reject)
    browser.stderr.on('data', (data) => {
      logs += data.toString()
      const match = logs.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { clearTimeout(timer); resolve(match[1]) }
    })
  })
  const host = new URL(endpoint).host
  const pages = await (await fetch(`http://${host}/json/list`)).json()
  socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let nextId = 0
  const pending = new Map()
  const errors = []
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const promise = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) promise?.reject(new Error(message.error.message))
      else promise?.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const value = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.text)
    return value.result.value
  }
  const waitFor = async (expression) => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`UI timeout: ${expression}`)
  }
  const navigate = async (hash, condition) => {
    await call('Page.navigate', { url: `${baseUrl}${hash}` })
    await waitFor(condition)
  }
  const screenshot = async (name) => {
    const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(path.join(outputDir, name), Buffer.from(result.data, 'base64'))
  }
  await mkdir(outputDir, { recursive: true })
  await call('Runtime.enable')
  await call('Page.enable')
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await navigate('#/competitions', 'document.querySelectorAll(".competition-card").length === 3')
  assert.equal(await evaluate('document.querySelectorAll(".competition-filters label").length'), 3)
  assert.ok(await evaluate('document.body.innerText.includes("暂未配置纠错接收渠道")'))
  await screenshot('competition-desktop.png')
  await evaluate(`(() => { const input = document.querySelector('input[type="search"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '不存在'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await waitFor('!!document.querySelector(".competition-empty")')
  await evaluate('document.querySelector(".competition-empty button").click()')
  await waitFor('document.querySelectorAll(".competition-card").length === 3')
  await evaluate(`(() => { const select = document.querySelector('.competition-filters select'); select.value = '物联网'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await waitFor('document.querySelectorAll(".competition-card").length === 1')
  await evaluate('document.querySelector(".competition-card-link").click()')
  await waitFor('!!document.querySelector(".competition-detail")')
  assert.ok(await evaluate('document.querySelector("h1").innerText.includes("中国大学生计算机设计大赛")'))
  await navigate('#/competitions/service-outsourcing', 'document.querySelector("h1")?.innerText.includes("服务外包")')
  await evaluate(`(() => { const select = document.querySelector('.competition-track-filter select'); select.value = 'trk-service-c'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await waitFor('document.querySelectorAll(".competition-timeline li").length === 3')
  assert.ok(await evaluate('!document.querySelector(".competition-timeline").innerText.includes("区域赛决赛")'))
  for (const slug of ['missing', '%E0%A4%A', 'software-cup/unknown']) await navigate(`#/competitions/${slug}`, 'document.querySelector("h1")?.innerText === "未找到这项比赛"')
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await navigate('#/competitions', 'document.querySelectorAll(".competition-card").length === 3')
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
  assert.ok(await evaluate(`getComputedStyle(document.querySelector('.nav-links a[href="#/competitions"]')).display !== 'none'`))
  await screenshot('competition-mobile.png')
  await navigate('#/competitions/computer-design', '!!document.querySelector(".competition-detail")')
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
  await screenshot('competition-detail-mobile.png')
  await evaluate(`document.querySelector('.nav-links a[href="#resources"]').click()`)
  await waitFor('!!document.querySelector("#resources")')
  assert.ok(await evaluate('document.querySelectorAll(".card-grid .card").length > 0'))
  await waitFor('Math.abs(document.querySelector("#resources").getBoundingClientRect().top - 115) < 5')
  await navigate('#/articles/read-open-source-projects', '!!document.querySelector(".markdown-body")')
  await navigate('#top', '!!document.querySelector(".hero")')
  assert.ok(await evaluate('document.querySelectorAll(".article-card").length >= 2'))
  assert.deepEqual(errors, [])
  console.log('PASS: desktop/mobile layouts, search, reset, filters, details, track timeline, invalid routes, feedback unconfigured, homepage/resources/articles, no runtime errors')
  console.log(`Screenshots: ${outputDir}`)
} finally {
  socket?.close()
  browser.kill()
}
