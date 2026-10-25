# code-hive 第二版：需求、开发与接口约定

## 基线与范围

2026-10-04 已读取 Gitee 最新 refs。远端 master 为 `2e922d3`，首版比赛提交位于 `feature/competition-module` 的 `2af8688`；经用户确认从该提交创建 `feature/member-access-favorites`，未合并 master、未推送或发布。开始时工作区干净。

已实现公开比赛浏览、注册与申请同事务、登录/退出/会话过期与撤销、管理员审核/暂停/恢复、拒绝后重新申请、收藏、订阅和我的比赛。文章与资源页面保留。自动通知、点赞、组队、投稿和 AI 推荐不在范围内，订阅旁显示“自动提醒尚未上线”。

已确认联系方式选填。拒绝后允许重新申请，旧申请与说明保留；重新申请将资格改为 pending。仅 suspended 可以恢复为 approved，管理员填写原因并写审计日志。仅 approved 可以暂停，不能暂停自己的管理员资格，避免锁死当前管理入口。审核说明、暂停/恢复原因必填；注册不能设置角色或资格。

账号恢复与密码找回、正式部署环境仍待用户决定。未开放找回入口，没有创建外部付费服务或执行部署。

## 模块和数据

`backend/app/core` 集中配置、数据库会话、Argon2、Cookie、CSRF、频率限制与三个权限依赖。`modules/auth` 处理账号会话，`membership` 处理申请和资格，`competitions` 查询公开资料，`favorites`/`subscriptions` 处理两个独立关系。`models` 使用 SQLAlchemy 2 的 Mapped 注解；Pydantic 定义入参与输出。接口与业务事务分离，关系公共查询与幂等写入共用 favorites/service.py，避免重复实现。

users 的 role 与 membership_status 分开。sessions 只存高熵凭证及 CSRF 的 SHA-256 哈希，不存明文 Cookie。所有个人接口从会话取用户 ID。每次请求读取资格；成员写入持有用户行的写锁直到事务结束，使暂停与成员操作在数据库中有序执行。

收藏和订阅分别以 `(user_id, competition_id)` 为复合主键，用数据库 `ON CONFLICT DO NOTHING` 保证重复和并发添加幂等；删除也幂等。归档保留比赛与用户关系，draft 不公开。用户名 NFKC 规范化、去空白、casefold 后唯一，slug 唯一，申请部分唯一索引确保每个用户最多一条 pending。

初始 schema 与资料导入使用两条 Alembic revision。`backend/seed/competitions-v1.json` 是冻结首版快照：3 个比赛、10 个赛道、19 个节点的固定 ID 全部保留。多赛道、多来源节点通过关联表保留。未知/仅月份日期为 NULL；仅日期不补时间。精确时刻按当届中国境内通知使用 Asia/Shanghai，原始日期说明及不确定性完整保留。首版没有来源逐字引文，evidence_text 留空，后续核验时补录；不把编辑摘要当作证据原文。

应用启动不创建、删除或重建表。已执行迁移不可改写。第二条导入迁移拒绝自动 downgrade，避免删除已关联的比赛；回退必须先备份并人工制定数据保留方案。

## API

开发 API 文档在 `http://127.0.0.1:8000/docs`。失败返回 `{"detail": ...}`，401 为未登录/过期，403 为资格/权限/CSRF 拒绝，404 为不存在或未发布，409 为冲突/已审核，422 为参数错误，429 为限流。列表采用 offset/limit，比赛与个人列表返回 items/total，管理员列表返回数组。

| 方法与地址 | 权限与约定 |
| --- | --- |
| GET /api/auth/csrf | 公开，返回 csrf_token/contact_required，设置 HttpOnly CSRF Cookie |
| POST /api/auth/register | CSRF，username/password/display_name/school/reason/discovery/contact；201 并自动登录 pending 账号 |
| POST /api/auth/login | CSRF，username/password；返回 user/csrf_token，轮换 Cookie |
| POST /api/auth/logout | require_login + CSRF；撤销当前会话，204 |
| GET /api/me | require_login，安全账号资料，无密码哈希 |
| GET /api/me/application | require_login，最新申请或 null |
| POST /api/me/application | require_login + CSRF，仅 rejected；school/reason/discovery/contact，201 |
| GET /api/competitions | 公开，query/direction/status/offset/limit，published 与 archived |
| GET /api/competitions/{slug} | 公开详情，包括来源、赛道、时间轴与本站分析 |
| GET /api/me/competitions | require_member，kind=all/favorites/subscriptions，可分页；每项含 competition/favorite/subscribed |
| GET /api/me/favorites、/api/me/subscriptions | require_member，分别列出两种关系，同时展示对方状态 |
| PUT、DELETE /api/me/favorites/{competition_id} | require_member + CSRF，添加/取消收藏，204 |
| PUT、DELETE /api/me/subscriptions/{competition_id} | require_member + CSRF，添加/取消订阅，204 |
| GET /api/admin/applications | require_admin，status=pending/approved/rejected，可分页 |
| GET /api/admin/applications/{id} | require_admin，申请与申请人资料 |
| POST /api/admin/applications/{id}/review | require_admin + CSRF，decision=approved/rejected，note 必填 |
| GET /api/admin/members | require_admin，approved/suspended 成员，可分页 |
| POST /api/admin/members/{id}/suspend、restore | require_admin + CSRF，reason 必填 |

require_login 允许 pending/rejected/suspended 登录查看自己的结果；require_member 要求 approved；require_admin 额外要求 admin。审核用 `WHERE status='pending'` 条件更新，申请结果、资格与审计同事务，重复/并发操作 409。

写请求先取得 CSRF Cookie，再发送同值 `X-CSRF-Token`；登录后使用响应的新 token。已登录请求同时验证 token 与服务器会话哈希绑定。Cookie 为 HttpOnly、SameSite=Lax、Path=/api；生产必须 Secure，允许来源必须 HTTPS。数据库频率计数在多 worker 间共享，登录按 IP 与账号分别限流，注册/重新申请限流。默认登录 10 次、注册/重申请 5 次/15 分钟固定窗口，可配置；429 有 Retry-After。代理层应限制体积与连接数，且只信任已配置代理的客户端 IP，不能信任任意 X-Forwarded-For。

## 本地启动

需要 Python 3.12+、Node.js 20.19+ 或 22.12+。以下 PowerShell 命令在仓库根目录执行：

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.lock.txt
Set-Location backend
# 可选：Copy-Item .env.example .env，然后修改本地配置。
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m app.cli create-admin --username admin --display-name 管理员
# 密码交互输入并确认，不传命令行参数、不写文档默认密码。
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

另一个终端在根目录运行 `npm ci`、`npm run dev`。前端 http://127.0.0.1:5173，公开列表 `#/competitions`，账号 `#/account`，我的比赛 `#/me/competitions`，管理员 `#/admin/membership`。Vite 将 /api 转给 8000；旧文章管理只拦截自己的 /api/admin/articles 命名空间。

此工作区已安装 backend/.venv。Python 不在 PATH 时可直接使用该环境。SQLite 默认 `backend/codehive-v2.db`，默认库已迁移且不预置管理员或测试密码。先运行初始化管理员命令。此前验证生成的 `codehive.db` 保留未删除；它不是本版默认库。

生产制品本地预览：`npm run build`，然后 `npm run preview -- --port 4173`。默认允许本机 5173 与 4173 来源，开发和预览均可执行写入；使用自定义配置时保持相应来源，例如 `CODEHIVE_ALLOWED_ORIGINS='["http://127.0.0.1:5173","http://127.0.0.1:4173"]'`。端口变化需更新允许来源并重启后端，不关闭 CSRF。

## 验证与部署边界

```powershell
npm run build
npm test
npm run lint
Set-Location backend
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m alembic check
```

独立浏览器回归：先启动前后端，运行 `node scripts/verify-competition-ui.mjs`。成员端到端检查使用临时库：在 backend 运行 `.venv/Scripts/python.exe -c 'import runpy; runpy.run_path("tests/prepare_browser.py", run_name="__main__")'`，把打印的 URL 设为测试后端的 CODEHIVE_DATABASE_URL，启动 8000，然后在根目录运行 `node scripts/verify-member-ui.mjs`。脚本的 qa-admin/qa-password-123 仅由该临时库准备器创建，不进入默认库或生产库。每次脚本创建唯一测试申请，不操作真实账号；生产环境禁止运行该准备器。

当前结果见根目录 PROGRESS.md：已实现与已测试逐项记录，已发布为否。SQLite 从空库升级、重复升级与资料 ID 保留已验证；PostgreSQL 已做 schema SQL 编译，但尚无真实 PostgreSQL 实例做迁移/并发集成验证。后续确认正式环境后，使用 `postgresql+psycopg://...`、同源 HTTPS 反向代理、Secure Cookie、持久化数据库与备份，先在独立 PostgreSQL 测试库跑同样的业务/并发测试，再决定正式发布。开发服务器与本地文章编辑器不能作为公网生产服务。

官方实现参考：[FastAPI 依赖会话](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/)、[Alembic 迁移环境](https://alembic.sqlalchemy.org/en/latest/tutorial.html)、[SQLAlchemy 数据库约束](https://docs.sqlalchemy.org/en/20/core/constraints.html)。
