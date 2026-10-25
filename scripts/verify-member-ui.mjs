// 无额外依赖的 Chromium 实际页面检查；浏览器仅使用临时独立 profile。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const browserPath = process.env.COMPETITION_TEST_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.COMPETITION_TEST_URL || 'http://127.0.0.1:5173/'
const outputDir = process.argv[2] || path.join(tmpdir(), 'codehive-member-qa')
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
  const input = async (name, value) => evaluate(`(() => { const field = document.querySelector('[name="${name}"]'); const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, ${JSON.stringify(value)}); field.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  const click = async (text) => evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText === ${JSON.stringify(text)}).click()`)
  const signIn = async (username) => {
    await navigate('#/account', '!!document.querySelector("input[name=username]")')
    await input('username', username); await input('password', 'qa-password-123')
    await evaluate('document.querySelector(".member-form").requestSubmit()')
    await waitFor('document.body.innerText.includes("我的账号与申请")')
  }
  const username = 'qa-member-' + Date.now()
  await navigate('#/account', '!!document.querySelector("input[name=username]")')
  await click('注册并申请')
  await waitFor('!!document.querySelector("textarea[name=reason]")')
  for (const [name, value] of Object.entries({username, password:'qa-password-123', display_name:'浏览器测试成员', school:'计算机学院', reason:'希望参与项目', discovery:'公开网站'})) await input(name, value)
  await screenshot('member-register-desktop.png')
  await evaluate('document.querySelector(".member-form").requestSubmit()')
  await waitFor('document.body.innerText.includes("等待管理员审核")')
  await navigate('#/me/competitions', 'document.body.innerText.includes("成员资格：待审核")')
  await navigate('#/account', 'document.body.innerText.includes("我的账号与申请")')
  await click('退出登录')
  await signIn('qa-admin')
  await navigate('#/admin/membership', 'document.body.innerText.includes("希望参与项目")')
  await input('note', '浏览器已核验')
  await click('批准申请')
  await waitFor('document.body.innerText.includes("操作已保存") && !document.body.innerText.includes("希望参与项目")')
  await navigate('#/account', 'document.body.innerText.includes("我的账号与申请")')
  await click('退出登录')
  await signIn(username)
  await navigate('#/competitions/service-outsourcing', '[...document.querySelectorAll("button")].some(b => b.innerText === "收藏比赛" && !b.disabled)')
  await click('收藏比赛'); await waitFor('[...document.querySelectorAll("button")].some(b => b.innerText === "取消收藏" && !b.disabled)')
  await click('订阅比赛'); await waitFor('[...document.querySelectorAll("button")].some(b => b.innerText === "取消订阅" && !b.disabled)')
  assert.ok(await evaluate('document.body.innerText.includes("自动提醒尚未上线")'))
  await navigate('#/me/competitions', 'document.querySelectorAll(".competition-card").length === 1')
  assert.ok(await evaluate('document.body.innerText.includes("已收藏 · 已订阅")'))
  await screenshot('member-mine-desktop.png')
  await call('Page.reload', {})
  await waitFor('document.querySelectorAll(".competition-card").length === 1')
  await click('取消收藏'); await waitFor('document.body.innerText.includes("未收藏 · 已订阅")')
  await click('已收藏'); await waitFor('!!document.querySelector(".competition-empty")')
  await click('已订阅'); await waitFor('document.querySelectorAll(".competition-card").length === 1')
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
  await screenshot('member-mine-mobile.png')
  await navigate('#/account', 'document.body.innerText.includes("我的账号与申请")')
  await click('退出登录')
  await signIn('qa-admin')
  await navigate('#/admin/membership', 'document.body.innerText.includes("成员审核与资格管理")')
  await click('成员资格'); await waitFor('document.body.innerText.includes("浏览器测试成员")')
  await screenshot('member-admin-mobile.png')
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
  const userSection = '[...document.querySelectorAll(".competition-panel")].find(s => s.innerText.includes("浏览器测试成员"))'
  await evaluate(`(() => { const section = ${userSection}; const field = section.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, '测试暂停'); field.dispatchEvent(new Event('input', {bubbles:true})); section.querySelector('form').requestSubmit(); })()`)
  await waitFor(`${userSection}?.innerText.includes('已暂停')`)
  await evaluate(`(() => { const section = ${userSection}; const field = section.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, '测试恢复'); field.dispatchEvent(new Event('input', {bubbles:true})); section.querySelector('form').requestSubmit(); })()`)
  await waitFor(`${userSection}?.innerText.includes('已批准')`)
  assert.deepEqual(errors, [])
  console.log('PASS: real registration, pending gate, admin approval, login/logout, independent favorites/subscriptions, reload persistence, filters, suspend/restore, desktop/mobile, no runtime errors')
  console.log('Screenshots: ' + outputDir)
} finally { socket?.close(); browser.kill() }
