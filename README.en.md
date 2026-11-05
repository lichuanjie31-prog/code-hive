# code-hive technical community

[简体中文](./README.md) | **English**

code-hive helps university students find learning resources, read technical articles and follow campus competitions. The community groups websites, tools and tutorials its members have tried into five subject areas. [Visit code-hive](https://codehive.asia)

Visitors can browse without an account. Members can apply for access, save competitions, subscribe to updates and see their choices in **My Competitions**. Contributors use a local editor to publish articles. The [v2 developer guide](docs/member-access-v2.md) covers setup, membership rules and API contracts. The [progress log](PROGRESS.md) records implementation and verification. Both are in Chinese.

## Features

**Public site**

- The home page introduces the community and shows learning statistics.
- Each featured article has a shareable URL of the form `#/articles/<slug>`.
- Resource cards link directly to material on frontend development, backend development, AI and data, general tools, and videos and hands-on projects.
- The layout supports desktop and mobile screens, including widths of 1280 and 375 pixels.

**Local article editor**

Run `npm run dev` and open `#/admin/articles`. The three panes show the article list, Markdown editor, and metadata with a preview. You can create an article, change its slug, upload a cover or inline image, and save the body and index together. Leaving with unsaved edits prompts for confirmation. To delete an article, type its full title.

**Maintaining the data**

Edit `src/data/resources.js` to add or remove a resource. The cards are rendered from that array. Competition records live in the FastAPI database and are served from `/api/competitions`. Alembic migrations preserve the original IDs for competitions, tracks and milestones.

Applicants can omit their contact information and reapply after rejection. Administrators can restore a suspended membership. Favorites and subscriptions are independent. Automatic reminders are planned.

## Technology

| Area | Implementation |
| --- | --- |
| Frontend | React 19 and React DOM |
| API | FastAPI, Pydantic, SQLAlchemy 2 and Alembic |
| Database | SQLite for local development, PostgreSQL in production |
| Build and lint | Vite 8 and oxlint |
| Tests | Node.js built-in test runner and pytest |
| Article rendering and navigation | Project-specific Markdown renderer and hash router |
| Styling | Plain CSS in `App.css` and `index.css` |

## Quick start

Use Node.js 20.19 or later within the 20.x series, or Node.js 22.12 or later, and Python 3.12 or later. First install the backend dependencies, apply the migrations, create an administrator and start FastAPI on port 8000. The commands are in the [local setup section of the developer guide](docs/member-access-v2.md#本地启动).

Then run the following from the repository root.

```bash
npm install
npm run dev
```

Open [the local site](http://127.0.0.1:5173). Choose **文章管理** (Article management) in the navigation to open the editor.

```bash
npm run build    # Build production assets in dist/
npm run preview  # Serve the production build locally
npm test         # Run the Node.js test suite
npm run lint     # Check the code with oxlint
```

## Repository layout

| Path | Contents |
| --- | --- |
| `index.html`, `vite.config.js` | HTML entry point, page metadata and Vite configuration |
| `src/App.jsx`, `src/main.jsx` | Page layout, hash routing and React entry point |
| `src/App.css`, `src/index.css`, `src/assets/` | Styles and bundled images |
| `src/data/resources.js`, `src/data/articles.js` | Resource catalog and article index |
| `src/content/articles/` | Markdown bodies and [manual publishing instructions](src/content/articles/README.md) |
| `src/articles/MarkdownArticle.jsx` | Article renderer |
| `src/admin/` | Local editor, styles and API client |
| `server/article-admin-plugin.js`, `server/article-store.js` | Vite middleware, validation, file updates and image uploads |
| `public/articles/`, `public/favicon.svg` | Public article images and site icon |
| `backend/` | FastAPI application, database migrations and backend tests |
| `tests/`, `docs/superpowers/` | Node.js tests, design notes and implementation plans |

## Publish an article

In the local editor, create an article, upload its cover, write the body and save. The body must contain at least 500 Chinese characters. The editor updates the same files you would edit by hand.

To add an article manually, follow these steps.

1. Write the body in `src/content/articles/<slug>.md`.
2. Put the cover and inline images in `public/articles/<slug>/`. Reference them as `/articles/<slug>/<filename>` and give each image descriptive alt text.
3. Add a complete entry to `src/data/articles.js`. Keep the index sorted by date, newest first.

```js
{
  slug: 'build-a-learning-map',
  title: 'Turn scattered tutorials into a learning plan',
  summary: 'A practical guide to choosing what to study next.',
  date: '2026-08-13',
  author: 'code-hive editors',
  cover: '/articles/build-a-learning-map/cover.png',
  markdownPath: 'src/content/articles/build-a-learning-map.md',
}
```

4. Run `npm run build`, `npm test` and `npm run lint`. Commit the index, Markdown and images, then deploy. You can replace the sample articles using the same process.

The renderer supports level-two headings, unordered lists, fenced code blocks, blockquotes, images on their own lines, inline links and inline code.

## Local article API

The Vite development server mounts the editor middleware at `/api/admin/articles`.

| Method | Path | Action |
| --- | --- | --- |
| GET | `/api/admin/articles` | List article metadata |
| GET | `/api/admin/articles/:slug` | Read an article and its Markdown body |
| POST | `/api/admin/articles` | Create an article |
| PUT | `/api/admin/articles/:slug` | Update an article, including its slug |
| POST | `/api/admin/articles/:slug/images` | Upload a cover or inline image |
| DELETE | `/api/admin/articles/:slug` | Delete an article with `confirmed: true` in the request body |

Slugs use lowercase letters and digits with single hyphens between segments. A duplicate returns `409 DUPLICATE_SLUG`. Dates must be valid `YYYY-MM-DD` values. Uploads accept PNG, JPEG, WebP and SVG, with a 5 MiB image limit and a 7 MiB request limit. The store validates file paths and uses temporary files, backups and atomic renames to recover from failed writes.

The editor API accepts loopback requests from `127.0.0.1` or `::1` and checks the request origin against the host. Vite loads the editor only during development. Production bundle tests scan the built JavaScript for editor endpoints and write operations. Published articles are served as static files. Membership and competition features use the production FastAPI service.

## Tests

Build before running the Node.js suite so the article checks can inspect the generated assets.

```bash
npm run build
npm test
```

The article tests cover content and image validation, index ordering, file writes and rollback, renames, uploads, deletion, the editor client, middleware routes and access checks. Other suites cover competitions, member routing and the release command. For backend access, migration and command-line tests, run `python -m pytest -q` from `backend/` using the project virtual environment.

## Deployment

From a clean checkout with the intended changes committed, run `npm run release` to check the project, push to the configured repositories, deploy the frontend and API, and verify the public site. Initial setup requires SSH access and server configuration. GitHub Actions runs CI using `.github/workflows/cicd.yml`. See the [CI/CD guide](docs/cicd.md) for setup and recovery instructions.

For a frontend-only build, `npm run build` writes static files to `dist/`. A static host can serve these files directly because the site uses hash routes. Competition and account features also require the FastAPI service at `/api`. The [BaoTa deployment guide](docs/baota-deploy.md) describes the older frontend publishing workflow.

## Repositories

- [GitHub](https://github.com/lichuanjie31-prog/code-hive)
- [Gitee](https://gitee.com/lichuanjie31/codehive-community-website)

## Campus competitions

Open `#/competitions` to browse competitions such as the China Software Cup (软件杯), the Service Outsourcing Innovation and Entrepreneurship Competition (服创赛), and the Chinese Collegiate Computing Competition (中国大学生计算机设计大赛). Each detail page lists the applicable year, official sources, track dates and details awaiting confirmation. The [competition guide](docs/competitions.md) explains how to maintain the records and configure a feedback email address.
