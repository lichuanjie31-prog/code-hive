# code-hive 技术社区网站

> 酿一份少走弯路的成长路线图 —— codehive.asia

code-hive 是一个面向大学生的技术社区站点。我们把亲测好用的学习网站、资料和工具按学习方向整理成"蜂巢"，一格一格摆好，让访问者开箱即取，少走弯路。

站点提供公开资源、精选文章与竞赛浏览，第二版加入账号申请审核、收藏、订阅和“我的比赛”，并保留只在本机开发环境开放的文章管理。第二版前后端启动及接口约定见 [第二版开发手册](docs/member-access-v2.md)，实施与验证状态见 [开发进度](PROGRESS.md)。当前改动仅在本地功能分支，未发布。

## 功能

**前台**

- 首屏 Hero、社区介绍、学习数据统计
- 精选文章列表与文章详情页（Hash 路由 `#/articles/<slug>`，无需服务端）
- 资源蜂巢：按前端开发、后端开发、AI 与数据、通用工具、视频与实战 5 个方向分格展示资源卡片，点击直达目标站点
- 响应式布局，桌面（1280px）与移动（375px）均已适配

**文章管理后台（仅 `npm run dev` 可用）**

- 入口 `#/admin/articles`，三栏布局：文章列表 / Markdown 正文编辑 / 元信息与预览
- 新建、编辑、重命名（改 slug）、删除文章，删除需输入完整标题二次确认
- 上传封面与正文图片，插入 Markdown 图片引用
- 保存时同步写入 Markdown 正文与文章索引，未保存草稿在离开页面前有提示

**数据维护方式**

站点资源全部集中在 `src/data/resources.js`。增删资源只需改这个数组，页面卡片会自动跟着变化，不需要动任何组件代码。

比赛资料统一保存在 FastAPI 后端数据库，前端从 `/api/competitions` 读取。原首版比赛、赛道与节点 ID 经 Alembic 迁移保留。成员申请联系方式选填；拒绝可重新申请，暂停可由管理员恢复。收藏与订阅独立；自动提醒尚未上线。

## 技术栈

| 层面 | 选择 |
| --- | --- |
| 框架 | React 19 |
| 后端 | FastAPI、Pydantic、SQLAlchemy 2、Alembic |
| 数据库 | 本地 SQLite；正式环境准备采用 PostgreSQL |
| 构建 | Vite 8 |
| 代码检查 | oxlint |
| 测试 | Node.js 内置 `node:test` |
| Markdown | 项目自带的轻量渲染器，无第三方依赖 |
| 样式 | 原生 CSS（`App.css` / `index.css`） |

没有引入 UI 组件库、路由库或 Markdown 库，依赖只有 `react` 与 `react-dom`。文章渲染、Hash 路由、后台 API 都是项目内自己实现的，便于长期维护和按需改造。

## 快速开始

环境要求：Node.js `^20.19.0 || >=22.12.0`（Vite 8 的限制），后端 Python 3.12+。需先按 [第二版启动步骤](docs/member-access-v2.md#本地启动) 安装后端依赖、执行迁移、初始化管理员并启动 FastAPI 8000。

```bash
npm install
npm run dev      # 启动开发服务器，默认 http://127.0.0.1:5173
```

打开 `http://127.0.0.1:5173`，开发模式下导航栏会出现「文章管理」入口。

```bash
npm run build    # 构建生产版本到 dist/
npm run preview  # 本地预览生产构建
npm test         # 运行前端与现有文章测试（49 项）
npm run lint     # oxlint 代码检查
```

## 目录结构

```
code-hive/
├── index.html                      # 站点入口，含 SEO 描述与 favicon
├── vite.config.js                  # Vite 配置，开发模式挂载文章管理插件
├── src/
│   ├── App.jsx                     # 页面骨架、Hash 路由、首页各区块
│   ├── App.css / index.css         # 站点样式
│   ├── main.jsx                    # React 挂载入口
│   ├── data/
│   │   ├── resources.js            # ★ 站点配置 + 分类 + 资源数据（日常只改这里）
│   │   └── articles.js             # 文章索引（后台保存时自动重写）
│   ├── content/articles/           # 文章 Markdown 正文
│   │   └── README.md               # 新增文章的手工流程说明
│   ├── articles/MarkdownArticle.jsx# 轻量 Markdown 渲染器
│   ├── admin/                      # 文章管理后台（开发环境按需加载）
│   │   ├── ArticleAdmin.jsx
│   │   ├── ArticleAdmin.css
│   │   └── article-admin-api.js    # 后台接口的前端调用封装
│   └── assets/hero.png
├── server/
│   ├── article-admin-plugin.js     # Vite 中间件插件，注册 /api/admin/articles
│   └── article-store.js            # 文章仓储：校验、原子写入、图片上传、删除
├── public/
│   ├── articles/                   # 封面与正文图片（按 slug 分目录）
│   └── favicon.svg
├── tests/                          # node:test 测试用例
└── docs/superpowers/               # 设计文档与实施计划
```

## 新增一篇文章

有两种方式，效果一致——后台做的事就是替你改下面这两个文件。

**方式一：用后台（推荐）**

`npm run dev` 后打开 `#/admin/articles`，新建文章、上传封面、写完正文保存即可。正文需不少于 500 个中文字符，否则会被拒绝。

**方式二：手工**

1. 在 `src/content/articles/` 新增 `<slug>.md` 正文文件；
2. 把封面和正文图片放进 `public/articles/<slug>/`，用 `/articles/<slug>/文件名` 引用，并填写准确的替代文本；
3. 在 `src/data/articles.js` 增加索引条目，字段必须填全：

```js
{
  slug: 'build-a-learning-map',                       // 小写字母、数字、连字符，全局唯一
  title: '把零散教程整理成一张可执行的学习地图',
  summary: '一句话摘要，展示在卡片和详情页头部。',
  date: '2026-08-13',                                 // YYYY-MM-DD，索引按日期倒序排列
  author: 'code-hive 编辑部',
  cover: '/articles/build-a-learning-map/cover.png',  // 必须以 /articles/ 开头
  markdownPath: 'src/content/articles/build-a-learning-map.md', // 必须与 slug 对应
}
```

4. 跑一遍 `npm test`、`npm run lint`、`npm run build`。

> 仓库内现有的两篇文章是**可替换的示例内容**，正式上线前可按同样步骤替换。

文章渲染器支持：二级标题 `##`、无序列表 `-` / `*`、围栏代码块 ``` ```、引用 `> `、整行图片、行内链接、行内代码。它是为本站内容约定写的，不支持完整 CommonMark。

## 文章管理 API

后台由 Vite 开发服务器的中间件提供，仅在 `command === 'serve'` 时挂载。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/articles` | 文章列表（不含正文） |
| GET | `/api/admin/articles/:slug` | 单篇详情，含 Markdown 正文 |
| POST | `/api/admin/articles` | 新建文章 |
| PUT | `/api/admin/articles/:slug` | 更新文章，可同时修改 slug |
| POST | `/api/admin/articles/:slug/images` | 上传正文图片或封面 |
| DELETE | `/api/admin/articles/:slug` | 删除文章，请求体需带 `confirmed: true` |

**校验与限制**

- slug 仅允许小写字母、数字和单个连字符；重复返回 `409 DUPLICATE_SLUG`
- 正文至少 500 个中文字符，图片必须写替代文本
- 日期必须是有效的 `YYYY-MM-DD`
- 上传图片 ≤ 5 MiB，单次请求 ≤ 7 MiB，仅接受 PNG / JPEG / WebP / SVG
- 所有文件路径经越界校验，写入采用"临时文件 + 备份 + 重命名"的原子替换，失败自动回滚

**安全边界**

- API 只接受回环地址（`127.0.0.1` / `::1`）请求，并校验请求 Origin 与 Host 同源
- 生产构建不包含后台代码：`ArticleAdmin` 仅在 `import.meta.env.DEV` 下动态导入，构建插件的 `apply: 'serve'` 也保证它不会进入 `dist/`
- 测试套件会扫描 `dist/assets/*.js`，一旦出现 `/api/admin/articles`、`saveArticle`、`uploadImage` 等字样即判定失败

因此线上站点是**纯静态只读页面**，发布新文章的流程是：本地用后台写完 → 提交 Markdown 与图片 → 重新构建部署。

## 测试

```bash
npm test
```

41 项测试，覆盖四个层面：

- `tests/articles.test.js` — 内容契约：slug 唯一性与格式、日期有效且倒序、Markdown 文件真实存在、正文 ≥ 500 中文字符、必备 Markdown 元素、图片存在且有替代文本；以及生产构建产物不含后台端点
- `tests/article-store.test.js` — 仓储层：字段校验、原子写入与回滚、重命名、上传（MIME / 体积 / 命名冲突）、删除
- `tests/article-admin-api.test.js` — 前端 API 封装的行为
- `tests/article-plugin.test.js` — 中间件路由、鉴权（非回环地址 403、跨源 403）、错误码映射

## 部署

```bash
npm run build
```

产物是纯静态文件，输出到 `dist/`，可直接部署到任意静态托管（对象存储 + CDN、Nginx、Vercel、Netlify 等）。站点使用 Hash 路由，不需要配置服务端重写规则。

宝塔站点从 Gitee 拉取并自动发布前端的步骤见 [宝塔部署说明](docs/baota-deploy.md)。比赛、账号等 `/api` 功能还需要单独部署 FastAPI 后端。

## 仓库

- Gitee：<https://gitee.com/lichuanjie31/codehive-community-website>
- GitHub：<https://github.com/lichuanjie31-prog/code-hive>

## 校园竞赛资讯专区

新增公开页面 `#/competitions`，首批整理软件杯、服创赛及中国大学生计算机设计大赛。资料适用年份、官方来源、赛道时间与待确认事项均在详情页标注。维护结构和可选反馈邮箱配置见 [竞赛专区说明](docs/competitions.md)。
