# PROGRESS.md

## 文章精选区开工回执（2026-08-13）
- 目标：首页展示 2 篇精选文章，并通过 Hash URL 进入可刷新的 Markdown 详情页。
- 顺序：内容校验测试 → 文章与本地图片 → 首页和详情页 → 反向验证与浏览器验收。
- 最大风险：Markdown 构建加载与 Hash 路由刷新、375px 移动端横向溢出。
- 基线：工作区干净；lint 退出码 0；build 退出码 0；18 模块，JS 197.76 kB，CSS 7.20 kB。
- 新增依赖原则：仅在 Markdown 渲染确需时引入，并记录用途与替代方案。
- [x] 内容管线：2 篇示例文章、4 张原创 SVG、集中索引和 10 项 Node 校验；未新增依赖，Markdown 由项目内受控渲染器处理。
- [x] 页面：导航、首页 2 张文章卡片、两个 Hash 详情页、刷新、返回入口和无效 slug 状态。
- [x] 浏览器验收：`#/articles/build-a-learning-map` 与 `#/articles/read-open-source-projects` 均显示标题和 1 张正文图，首篇刷新后标题不变；`#/articles/missing-article` 显示未找到和返回首页。
- [x] 响应式：1280px 页面 scrollWidth 1265；375px 详情页和首页 scrollWidth 均 360，小于视口；图片均未越过视口，移动端文章卡片为单列。
- [x] 反向验证：封面临时指向 `/articles/missing-cover.svg` 后 `npm test` 为 9 通过、1 失败、0 跳过，报 ENOENT；还原后重新执行总验收。
- 构建体积：JS gzip 70.27 kB，低于 100 kB；CSS gzip 2.88 kB。
- [x] 最终浏览器检查：375px 下详情正文边界为 16px 到 344.35px，图片全部加载；控制台错误与警告均为 0。
- [x] 最终命令：10 项测试全过、跳过 0；lint 退出码 0；build 退出码 0；现有资源仍为 14 条、5 分类。

## 开工回执（任务 0）
- 理解的目标：给 code-hive 技术社区做深色科技感中文单页官网（名片站），资源集中在 src/data/resources.js
- 顺序：脚手架 → 数据层 → 页面 → 反向验证+总验收
- 最大风险：视觉为半托管项（领导亲验）；npm 11 吞 --template 参数必须用 npx
- 环境核对：Node v26.4.0 / npm 11.17.0 / git 2.42.0 / 工作区空 —— 全部与任务书一致（2026-08-06）

## 进度
- [x] 任务 0：环境核对通过，回执已写
- [x] 任务 1：脚手架完成（注：工作区非空时 create-vite 交互提示会取消，改用子目录 scaffold-tmp 脚手架后移动到根目录；npx.ps1 在沙箱里报 $LASTEXITCODE 错误，改用 npx.cmd），build 退出码 0，提交 scaffold
- [x] 任务 2：resources.js 14 条资源、5 个分类，验收计数 14 ≥ 10，提交 data
- [x] 任务 3：单页官网完成（导航/首屏/关于/资源分格/页脚，深色+霓虹渐变+六边形+悬停动效），build 0、oxlint 0 错误，提交 page
- [x] 任务 4：反向验证通过（hive-check 先命中后消失），build 退出码 0，preview 返回 200 OK，提交 final

## 验收结果
- npm run build 退出码 0 ✓
- preview http://localhost:4173 返回 200 OK ✓
- 反向验证：改 url→build→命中 hive-check；还原→build→消失 ✓
- resources.js 14 条资源（≥10）、5 分类（≥4）✓
- git 提交 4 个：scaffold / data / page / final（≥3）✓
- BLOCKED.md 已提交，内容：无 ✓
