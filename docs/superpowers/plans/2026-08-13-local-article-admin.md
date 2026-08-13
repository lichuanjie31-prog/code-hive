# Local Article Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a localhost-only article manager that edits Markdown, uploads local images, previews the published result, and persists article changes directly into the code-hive repository.

**Architecture:** A focused Node `ArticleStore` owns validation and filesystem writes. A development-only Vite plugin exposes that store through same-origin JSON endpoints. A React admin route consumes those endpoints and reuses the public Markdown renderer, while production renders a disabled page and contains no writable endpoint.

**Tech Stack:** React 19, Vite 8 plugin middleware, Node built-in test runner, Node filesystem APIs, existing CSS design tokens, zero new runtime dependencies.

## Global Constraints

- The admin URL is `#/admin/articles` and the API binds through the Vite server on `127.0.0.1`.
- Preserve both current article slugs, all 14 resources, and the existing public article schema.
- New article bodies live at `src/content/articles/<slug>.md`; new images live at `public/articles/<slug>/`.
- Accept only `image/png`, `image/jpeg`, `image/webp`, and `image/svg+xml`; cap decoded files at 5 MiB and JSON requests at 7 MiB.
- Reject arbitrary paths, dot segments, path separators, duplicate slugs, malformed dates, missing fields, body text below 500 Chinese characters, and Markdown images without alt text.
- Existing shared images stay in place when old articles are edited or deleted. Delete only `public/articles/<slug>/`.
- Production build must contain no writable API endpoint and must show an unavailable message at the admin hash.
- Use real temporary files in store tests. Do not mock the filesystem or weaken the existing article tests.

---

## File Map

- `server/article-store.js`: validation, index parsing and serialization, safe path construction, atomic saves, uploads, and deletion.
- `server/article-admin-plugin.js`: localhost and same-origin guards, JSON body limits, HTTP routing, and error responses.
- `src/articles/MarkdownArticle.jsx`: shared public and admin preview renderer extracted from `App.jsx`.
- `src/admin/article-admin-api.js`: browser-side typed request helpers and image-to-base64 conversion.
- `src/admin/ArticleAdmin.jsx`: list, metadata form, Markdown editor, live preview, upload, save, dirty state, and delete confirmation.
- `src/admin/ArticleAdmin.css`: three-pane responsive admin layout using existing tokens.
- `tests/article-store.test.js`: real-filesystem store contract and security coverage.
- `tests/article-admin-plugin.test.js`: real HTTP middleware coverage including production isolation.
- `tests/articles.test.js`: retain public content checks and add production bundle assertions.
- `vite.config.js`: install the development-only plugin and keep host defaulted to loopback.
- `src/App.jsx`: route to admin, expose the admin navigation only during development, and import the shared renderer.
- `package.json`: run all Node tests.

### Task 1: Safe article repository

**Files:**
- Create: `server/article-store.js`
- Create: `tests/article-store.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `createArticleStore({ rootDir, fsImpl? })` with async methods `list()`, `get(slug)`, `save({ originalSlug, article, body })`, `upload({ slug, kind, fileName, mimeType, base64 })`, and `remove({ slug, confirmed })`.
- Produces: `validateSlug(slug)`, `validateArticleInput(article, body)`, and `ArticleStoreError` carrying `status` and `code`.

- [ ] **Step 1: Write failing store tests using a real temporary project**

Create fixtures with an `articles.js`, two Markdown files, one shared image, and one article-owned image directory. Cover these literal outcomes:

```js
test('list and get return article metadata with Markdown body', async () => {
  const store = createArticleStore({ rootDir })
  assert.equal((await store.list()).length, 2)
  assert.equal((await store.get('first-post')).body, validBody)
})

test('save creates a valid article and keeps the index date-descending', async () => {
  await store.save({ originalSlug: null, article: validArticle, body: validBody })
  assert.deepEqual((await store.list()).map((item) => item.slug), ['new-post', 'first-post', 'older-post'])
  assert.equal(await readFile(join(rootDir, 'src/content/articles/new-post.md'), 'utf8'), validBody)
})

test('save rejects duplicate and traversal slugs without touching files', async () => {
  await assert.rejects(() => store.save({ originalSlug: null, article: { ...validArticle, slug: 'first-post' }, body: validBody }), { code: 'DUPLICATE_SLUG' })
  await assert.rejects(() => store.get('../package.json'), { code: 'INVALID_SLUG' })
})

test('upload writes only an allowed image under the article directory', async () => {
  const result = await store.upload({ slug: 'new-post', kind: 'image', fileName: 'diagram.png', mimeType: 'image/png', base64: tinyPngBase64 })
  assert.equal(result.url, '/articles/new-post/diagram.png')
  await access(join(rootDir, 'public/articles/new-post/diagram.png'))
})

test('remove requires confirmation and leaves shared images untouched', async () => {
  await assert.rejects(() => store.remove({ slug: 'first-post', confirmed: false }), { code: 'CONFIRMATION_REQUIRED' })
  await store.remove({ slug: 'first-post', confirmed: true })
  await access(join(rootDir, 'public/articles/shared-cover.svg'))
})
```

Add separate tests for missing fields, invalid date, fewer than 500 Chinese characters, missing image alt text, disallowed MIME type, files over 5 MiB, filename cleanup, rename collision, and failure rollback.

- [ ] **Step 2: Run the store test and confirm RED**

Run: `node --test tests/article-store.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/article-store.js`.

- [ ] **Step 3: Implement validation and safe paths**

Use the exact slug expression `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`. Resolve every target from `rootDir` and a fixed directory, then verify `relative(base, target)` contains no `..` and is not absolute. Count Chinese characters with `/[\u3400-\u9fff]/g`. Detect Markdown images with `/!\[([^\]]*)\]\((\/articles\/[^)]+)\)/g` and reject empty alt values.

- [ ] **Step 4: Implement index parsing, deterministic serialization, and atomic writes**

Read the ESM index with a cache-busted `pathToFileURL(indexPath) + '?t=' + Date.now()`. Serialize only JSON-safe string fields into a stable `export const articles = [...]` module followed by the existing route helper functions. Write body and index to sibling `.tmp` files, validate both temporary outputs, rename the old files to `.bak`, replace both targets, and restore backups if either replacement fails. Always remove temporary and backup files in `finally`.

- [ ] **Step 5: Implement uploads and confirmed deletion**

Decode base64 after checking format and estimated size. Map MIME types to fixed extensions, sanitize the stem to lowercase ASCII letters, digits and hyphens, then append `-2`, `-3` on collision. Use `cover.<ext>` for `kind: 'cover'`. Delete only the Markdown file and `public/articles/<slug>` after writing the updated index successfully.

- [ ] **Step 6: Run tests and update the test script**

Change the script to `node --test tests/*.test.js`. Run `npm test` and require all existing and new tests to pass with skipped 0.

- [ ] **Step 7: Commit**

```bash
git add package.json server/article-store.js tests/article-store.test.js
git commit -m "feat: add safe article repository"
```

### Task 2: Development-only HTTP API

**Files:**
- Create: `server/article-admin-plugin.js`
- Create: `tests/article-admin-plugin.test.js`
- Modify: `vite.config.js`

**Interfaces:**
- Consumes: `createArticleStore({ rootDir })` from Task 1.
- Produces: `articleAdminPlugin({ rootDir, mode })`, a Vite plugin with `apply: 'serve'` and `configureServer(server)`.
- Produces endpoints: `GET /api/admin/articles`, `GET /api/admin/articles/:slug`, `POST /api/admin/articles`, `PUT /api/admin/articles/:slug`, `POST /api/admin/articles/:slug/images`, and `DELETE /api/admin/articles/:slug`.

- [ ] **Step 1: Write failing middleware tests against a real HTTP server**

Create a minimal middleware harness using `node:http`. Assert `GET` list and detail responses, create and update persistence, upload response URL, delete confirmation, 404 behavior, 7 MiB body rejection, origin rejection, and remote address rejection. Assert `articleAdminPlugin({ mode: 'production' })` returns no plugin or no registered middleware.

```js
test('remote and cross-origin writes are rejected', async () => {
  assert.equal((await request('/api/admin/articles', { method: 'POST', origin: 'http://evil.test' })).status, 403)
  assert.equal((await invokeMiddleware({ remoteAddress: '192.168.1.20' })).status, 403)
})
```

- [ ] **Step 2: Run the plugin test and confirm RED**

Run: `node --test tests/article-admin-plugin.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/article-admin-plugin.js`.

- [ ] **Step 3: Implement guarded routing and error mapping**

Allow remote addresses `127.0.0.1`, `::1`, and IPv4-mapped loopback only. Accept missing `Origin` for same-process tests; when present, require its host to equal the request `Host`. Read request bodies incrementally and return status 413 after 7 MiB. Return JSON `{ data }` on success and `{ error: { code, message } }` on failure. Map store errors to their declared status and unexpected errors to 500 without exposing stack traces.

- [ ] **Step 4: Install the plugin in Vite development mode**

Change `vite.config.js` to a mode callback:

```js
export default defineConfig(({ command }) => ({
  plugins: [react(), ...(command === 'serve' ? [articleAdminPlugin({ rootDir: process.cwd(), mode: 'development' })] : [])],
  server: { host: '127.0.0.1' },
}))
```

- [ ] **Step 5: Verify API and production isolation tests**

Run: `node --test tests/article-admin-plugin.test.js`

Expected: all API tests pass, skipped 0.

- [ ] **Step 6: Commit**

```bash
git add vite.config.js server/article-admin-plugin.js tests/article-admin-plugin.test.js
git commit -m "feat: expose localhost article admin api"
```

### Task 3: Shared Markdown renderer and admin client

**Files:**
- Create: `src/articles/MarkdownArticle.jsx`
- Create: `src/admin/article-admin-api.js`
- Create: `tests/article-admin-api.test.js`
- Modify: `src/App.jsx`
- Modify: `src/App.css`

**Interfaces:**
- Produces: `MarkdownArticle({ source })` for public details and admin preview.
- Produces: `createAdminApi(fetchImpl)` with `listArticles()`, `getArticle(slug)`, `saveArticle(originalSlug, payload)`, `uploadImage(slug, file, kind)`, and `deleteArticle(slug)`.
- Produces: `fileToUploadPayload(file, kind)` returning `{ kind, fileName, mimeType, base64 }`.

- [ ] **Step 1: Write failing client contract tests**

Use a recording `fetchImpl` and real `Blob`/`File` objects. Assert exact methods, encoded slug URLs, JSON bodies, error propagation, and base64 output. Name each test after the user-visible failure it prevents.

```js
test('saveArticle uses POST for new articles and PUT for edits', async () => {
  await api.saveArticle(null, payload)
  await api.saveArticle('old-slug', payload)
  assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
    ['/api/admin/articles', 'POST'],
    ['/api/admin/articles/old-slug', 'PUT'],
  ])
})
```

- [ ] **Step 2: Run the client test and confirm RED**

Run: `node --test tests/article-admin-api.test.js`

Expected: FAIL because `src/admin/article-admin-api.js` is missing.

- [ ] **Step 3: Extract the renderer without changing public behavior**

Move `InlineMarkdown` and `MarkdownArticle` intact from `App.jsx` into `src/articles/MarkdownArticle.jsx`, export `MarkdownArticle`, import it from `App.jsx`, and keep the existing class names. Run `npm test`, `npm run lint`, and `npm run build` before continuing.

- [ ] **Step 4: Implement the browser API client**

Centralize JSON parsing and throw an `AdminApiError` containing status, code, and message. Convert files with `FileReader.readAsDataURL`, keep only the part after the comma, and reject unsupported MIME types or files above 5 MiB before sending.

- [ ] **Step 5: Run client and full tests**

Run: `npm test`

Expected: all tests pass, skipped 0.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/App.css src/articles/MarkdownArticle.jsx src/admin/article-admin-api.js tests/article-admin-api.test.js
git commit -m "refactor: share article markdown rendering"
```

### Task 4: Article management interface

**Files:**
- Create: `src/admin/ArticleAdmin.jsx`
- Create: `src/admin/ArticleAdmin.css`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `createAdminApi(fetch)`, `fileToUploadPayload`, and `MarkdownArticle` from Task 3.
- Produces: `ArticleAdmin()` routed at `#/admin/articles` during development.

- [ ] **Step 1: Add route-level behavior tests before the component**

Extend `tests/article-admin-api.test.js` with exported pure helpers from `ArticleAdmin.jsx`: `slugifyTitle(title)`, `insertMarkdownAtSelection(source, selectionStart, selectionEnd, snippet)`, and `hasUnsavedChanges(saved, draft)`. Assert Chinese-only titles generate `article-YYYYMMDD-HHMMSS`, Latin titles generate lowercase hyphenated slugs, selected text becomes link alt text, image syntax inserts at the caret, and dirty comparison ignores object identity.

- [ ] **Step 2: Run helper tests and confirm RED**

Run: `node --test tests/article-admin-api.test.js`

Expected: FAIL because the exported helpers do not exist.

- [ ] **Step 3: Build list and editor state**

On mount call `listArticles()`, select the first item, then call `getArticle(slug)`. Provide a search field, “新建文章”, article buttons, metadata fields, Markdown textarea, and loading/error/empty states. New drafts default author to `code-hive 编辑部`, date to local `YYYY-MM-DD`, body to a valid starter template, and slug from the title.

- [ ] **Step 4: Add Markdown toolbar and live preview**

Toolbar actions insert `## 标题`, list syntax, `[链接文字](https://example.com)`, and fenced `js` code at the current textarea selection. Render `<MarkdownArticle source={draft.body} />` beside the editor. Keep preview input entirely local until save.

- [ ] **Step 5: Add cover and inline image workflows**

For cover upload, require a selected slug, call `uploadImage(slug, file, 'cover')`, and set `draft.cover` to the returned URL. For inline images, request alt text in a visible field, upload with kind `image`, then insert `![alt](returnedUrl)` at the caret. Disable upload while no valid slug exists and show server errors beside the relevant control.

- [ ] **Step 6: Add save, rename confirmation, and delete confirmation**

Save calls `saveArticle(originalSlug, { article: metadata, body })`. If an existing slug changed, show an in-page confirmation before the request. Delete requires a dialog containing the exact title and a second “确认删除” action; after success reload the list. Keep draft input when any request fails.

- [ ] **Step 7: Add dirty-state protection and production behavior**

Register `beforeunload` only while `hasUnsavedChanges(saved, draft)` is true. In `App.jsx`, show the admin navigation and lazy-load `ArticleAdmin` only under `import.meta.env.DEV`. When the hash is `#/admin/articles` in production, render a static “文章管理仅在本机开发环境开放” page with a home link.

- [ ] **Step 8: Style desktop and mobile layouts**

Use a 260px list rail and a two-column editor/preview workspace above 1100px. Collapse to list plus stacked editor and preview below 900px. Ensure 375px has no horizontal page overflow, textarea remains at least 420px tall, controls have visible labels, focus rings use `--cyan`, destructive actions use a distinct red treatment, and statuses use `role="status"` or `role="alert"`.

- [ ] **Step 9: Run all static checks**

Run: `npm test`, `npm run lint`, and `npm run build`.

Expected: exit code 0 for all commands, skipped 0.

- [ ] **Step 10: Commit**

```bash
git add src/App.jsx src/admin/ArticleAdmin.jsx src/admin/ArticleAdmin.css tests/article-admin-api.test.js
git commit -m "feat: add local article management page"
```

### Task 5: End-to-end verification and production audit

**Files:**
- Modify: `tests/articles.test.js`
- Modify: `PROGRESS.md`
- Modify: `BLOCKED.md` only if a real unresolved issue exists

**Interfaces:**
- Consumes every interface from Tasks 1 through 4.
- Produces final browser evidence and production-isolation evidence.

- [ ] **Step 1: Add production artifact assertions and confirm RED if the endpoint leaks**

After `npm run build`, read all `dist/assets/*.js` and assert they do not contain `/api/admin/articles`, `saveArticle`, or `uploadImage`. Keep the assertion behavioral by also running preview at `#/admin/articles` and checking that only the unavailable message is rendered.

- [ ] **Step 2: Run automated verification**

Run in order:

```bash
npm test
npm run lint
npm run build
```

Expected: every command exits 0; all tests pass; skipped 0; current article tests still report two articles and resources still report 14 entries.

- [ ] **Step 3: Run the full browser workflow on localhost**

Start `npm run dev`. At 1280px, open `#/admin/articles`, load each existing article, verify preview headings and images, create a temporary article with a PNG cover and inline PNG, save, reload, and confirm byte-for-byte body persistence. Edit its summary and body, save, and reload. Trigger delete, cancel once, then confirm and verify its Markdown and owned image directory are gone.

- [ ] **Step 4: Verify failure and recovery paths**

Try duplicate slug, `../escape`, an unsupported text file renamed as an image, an image above 5 MiB, and navigation with dirty input. Confirm visible errors, unchanged repository files, and a leave confirmation. Stop the dev server, revisit the admin tab, and confirm service-unavailable feedback preserves the draft.

- [ ] **Step 5: Verify responsive and public regressions**

At 375px and 1280px, measure `document.documentElement.scrollWidth <= window.innerWidth`. Open both public article URLs, reload them, confirm all images have `naturalWidth > 0`, and verify all 14 resource cards still appear. Check browser console errors and warnings equal 0.

- [ ] **Step 6: Record evidence and final diff audit**

Write command output summaries, browser paths, viewport measurements, temporary article cleanup, production bundle string scan, and any deviations into `PROGRESS.md`. Run `git diff --check` and inspect `git status --short`. Keep `BLOCKED.md` as `无` when no issue remains.

- [ ] **Step 7: Commit**

```bash
git add tests/articles.test.js PROGRESS.md BLOCKED.md
git commit -m "test: verify local article admin workflow"
```
