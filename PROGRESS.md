# PROGRESS.md

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
