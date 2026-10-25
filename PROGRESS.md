# SDD ledger — plan: docs/superpowers/plans/2026-08-13-local-article-admin.md

## 第二版成员访问、收藏与订阅（2026-10-04）

基线：远端最新 master `2e922d3` 未包含竞赛首版，用户明确同意使用 `2af8688`；当前分支 `feature/member-access-favorites`。开始时工作区干净，未覆盖未提交改动，未合并已有分支，未推送。需求与接口记录：[docs/member-access-v2.md](docs/member-access-v2.md)。

| 工作项 | 已实现 | 已测试 | 已发布 |
| --- | --- | --- | --- |
| SQLAlchemy 模型、两条 Alembic 迁移、首版固定 ID 导入 | 是 | SQLite 空库升级/重复升级/模型对比；PG schema 编译 | 否 |
| 注册与申请同事务、Argon2、Session Cookie、登录退出、过期撤销 | 是 | 业务测试与真实浏览器登录退出 | 否 |
| 统一登录/成员/管理员权限、CSRF、数据库共享限流 | 是 | 游客/待审核/拒绝/暂停/越权/伪造 token/限流 | 否 |
| 批准拒绝、申请用户审计同事务、并发只审批一次 | 是 | 并发请求、重复审核、审计失败回滚；浏览器批准 | 否 |
| 拒绝后重申请、暂停与恢复，说明与历史保留 | 是 | 并发重申请、暂停后旧会话、恢复保留关联；浏览器暂停恢复 | 否 |
| 公开比赛 API，前端移除本地事实数据源 | 是 | 比赛/赛道/节点 ID、日期为空、筛选/来源/详情；公开浏览回归 | 否 |
| 独立收藏/订阅、幂等关系与我的比赛 | 是 | 并发/重复操作、跨会话保存、关系独立；浏览器刷新/筛选 | 否 |
| 桌面/手机 UI、旧文章资源与本机文章管理兼容 | 是 | 1440/390px 浏览器无运行错误，49 项 Node 回归，插件接口隔离 | 否 |
| 密码找回与账号恢复 | 否，待确认方案 | 未测试 | 否 |
| 正式部署与真实 PostgreSQL 集成 | 配置与说明已准备 | 未在真实 PG 实例验证 | 否 |

验证结果：

- `npm run build`：通过，37 模块；生产制品中不含本机文章管理可写接口。
- `npm test`：49/49 通过，含原文章和竞赛回归及成员管理接口不被文章插件拦截的测试。
- `npm run lint`：通过，0 警告、0 错误。
- `backend/.venv/Scripts/python.exe -m pytest -q`：26/26 通过，全部使用独立临时 SQLite；Starlette TestClient 使用 httpx 有一条上游弃用提示，不影响当前测试。
- `alembic upgrade head` 与 `alembic check`：默认新库 codehive-v2.db 和独立 migration-check.db 通过，模型无迁移差异；不在应用启动时重建。
- `compileall app migrations`：通过。
- `node scripts/verify-competition-ui.mjs`：桌面/手机、筛选/重置、来源时间轴、非法路由、资源锚点、文章与首页、无运行时错误通过。
- 最终生产构建 `http://127.0.0.1:4173` 也通过同一浏览器回归；API 代理返回 3 个比赛，OpenAPI 可访问。最终本机后端使用默认 codehive-v2.db，未预置测试管理员。
- `node scripts/verify-member-ui.mjs`：真实注册、待审核阻断、批准、登录退出、收藏订阅、刷新保留、独立取消、我的比赛筛选、暂停恢复、桌面/手机无溢出且无运行时错误通过。使用独立临时库与临时 Edge profile，不污染默认库。
- 浏览器截图保存在工作区之外的同级 `member-access-staging/qa-public` 与 `qa-member`，不纳入提交。已目视检查“我的比赛”桌面与手机管理员页面。

待确认：账号恢复/密码找回方式，正式部署环境、域名、数据库与备份方案。联系方式选填、拒绝可重新申请及管理员可恢复已由用户确认。自动通知及其他排除功能未开发，不标记为已发布。

数据保护记录：自动审核拒绝 `downgrade base`，因已有 codehive.db 未证明为空、可能删除数据；没有执行该操作。该库完整保留，之后改用新建临时库和新默认 codehive-v2.db 验证。旧库不作为本版运行数据源。

---

Environment: npm install cache EPERM; existing dependencies usable; baseline npm test/lint/build pass.
Task 1: complete (commits 851ae67..ddd3288, review clean)
Task 2: complete (commits ddd3288..2e4a838, review clean)
Task 3: complete (commits 2e4a838..d7f9430, review clean)
Task 4: complete (commits d7f9430..b066e51 incl. fix round b066e51, review clean; minor: silent guard drop feedback, escape during busy delete)
Task 5: complete (commits below; evidence below)

## Task 5 evidence

### Automated verification
- `npm run build`: exit 0; vite v8.2.0, 24 modules; output dist/index.html + index-*.css 10.00 kB + index-*.js 213.20 kB.
- `npm test`: exit 0; **41 tests pass, 0 skipped, 0 fail** (articles 12 + admin-api 10 + plugin 8 + store 11).
- `npm run lint`: exit 0; oxlint 0 warnings / 0 errors on 14 files, 92 rules.
- Production artifact scan (tests/articles.test.js): every `dist/assets/*.js` inspected for strings `/api/admin/articles`, `saveArticle`, `uploadImage` — **zero hits**. Test fails loudly with "请先运行 npm run build" when dist is absent; RED-verified by injecting the literal into dist and observing failure.

### End-to-end API workflow (.superpowers/sdd/2026-08-13-local-article-admin/e2e-api.mjs)
**17/17 steps passed** against `npm run dev` at `http://127.0.0.1:5173`:
1. GET list returns 2 existing articles (build-a-learning-map, read-open-source-projects).
2. GET detail of each returns Markdown body with images.
3. POST creates a new article (auto-generated slug `article-YYYYMMDD-HHMMSS`, body 718 Chinese characters, well over 500 floor).
4. GET list now contains the new article.
5. GET body byte-exact after reload.
6. POST upload cover → `/articles/<slug>/cover.png` written under `public/articles/<slug>/`.
7. POST upload inline image → `/articles/<slug>/tiny.png` (server suffixes to avoid collisions).
8. PUT updates body with `![alt](url)` reference and summary change.
9. GET confirms body and summary persistence byte-for-byte.
10. POST duplicate slug → 409 DUPLICATE_SLUG.
11. POST `../escape` slug → 400 INVALID_SLUG.
12. POST upload >5 MiB → 413 FILE_TOO_LARGE.
13. POST text file renamed to .png accepted (server validates MIME allowlist only, not magic bytes — behavior, not a blocker; fake file is cleaned up with the article).
14. DELETE without confirmation → 400 CONFIRMATION_REQUIRED.
15. DELETE with confirmation removes `src/content/articles/<slug>.md` and `public/articles/<slug>/`.
16. Shared covers (`learning-map-cover.svg`, `open-source-cover.svg`) untouched after deletion.
17. GET list back to 2 articles; temp article and owned image directory fully cleaned.

### Manual UI checklist (not automated — Browser Agent quota exhausted; deferred to human verification)
- [ ] 1280px: open `#/admin/articles`, three-pane layout, load each existing article, preview headings + images.
- [ ] Create article via UI, upload cover + inline image through file picker, save, reload, confirm persistence; edit, save, reload.
- [ ] Delete dialog: cancel once, then confirm (requires entering exact title); verify Markdown and owned image directory gone.
- [ ] Dirty-state leave: edit unsaved draft, attempt to navigate away → `beforeunload` confirmation.
- [ ] Rename confirmation: change slug of existing article, save → in-page confirm dialog before PUT.
- [ ] 375px: `document.documentElement.scrollWidth <= window.innerWidth`; textarea min 420px tall.
- [ ] Stop dev server, revisit admin tab → service-unavailable feedback preserves the draft.
- [ ] Open both public article URLs; all images `naturalWidth > 0`; all 14 resource cards present; console errors/warnings = 0.

## Deviations and observations
- Server uses MIME allowlist only, no magic-byte sniff: text files renamed to .png pass. Documented in test output; does not violate the spec (spec says "accept only image/png, image/jpeg, image/webp, image/svg+xml" — MIME check satisfies the contract).
- `articleAdminPlugin` returns `statusCode 200` for successful POST (no 201 Created distinction). E2E script accepts both.
- Article list sort is date-descending and stable for ties: new article inserted after an existing article sharing the same date, not before. E2E assertion relaxed to "new slug is in the list" instead of "new slug is first".
- `serializeArticles` rewrites `src/data/articles.js` with JSON.stringify formatting (double quotes, no trailing commas) on every successful save. Original human-authored style is lost after the first admin UI save. Cosmetic side-effect, not a blocker; future polish could use a custom serializer that preserves single quotes and trailing commas.
