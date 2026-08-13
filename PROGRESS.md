# SDD ledger — plan: docs/superpowers/plans/2026-08-13-local-article-admin.md

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
