# 一键检查、推送与部署

适用本项目的 React/Vite、FastAPI、PostgreSQL 和宝塔 HTTPS 站点。默认服务器为 `root@47.102.85.207:22`，发布分支为 `master`，同时推送 GitHub `origin` 与 Gitee `gitee`。

## 日常发布

首次准备完成后，在仓库目录运行：

```powershell
# 先检查并提交本次需要发布的文件。脚本拒绝未提交的工作区。
git status --short
git add <明确的文件路径>
git commit -m "本次更新说明"
npm run release
```

脚本自动执行 SSH 预检查、npm ci、生产构建、前端测试、lint、后端 pytest、推送两个仓库、打包当前提交及构建产物、SSH 上传、部署与公网验证。任一步失败会返回非零退出码。仓库推送无法跨平台原子执行，第二个仓库推送失败时第一个可能已更新，此时不会继续部署，修复后重跑即可。不会强制推送。

只运行本地检查：`npm run release -- --check`。该命令会重装前端锁定依赖。后端需先安装锁定依赖。

后续可以直接告诉 Codex「检查并部署当前项目」，按本文执行。发布前明确提交范围，禁止把凭据加入 Git。

## 本机一次性配置

需要 Node.js 22.12+、Python 3.12、Git、OpenSSH、tar。

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install --no-cache-dir -r backend/requirements.lock.txt
Copy-Item deploy/config.example.json deploy/config.local.json
```

`deploy/config.local.json` 已被 Git 忽略。可修改 SSH 地址、端口、仓库列表、分支及 Python 路径。`identityFile` 指定本机私钥文件路径，也可通过 `CODEHIVE_SSH_KEY_FILE` 设置。发布脚本自动识别 `backend/.venv`，也可通过 `CODEHIVE_PYTHON` 指定解释器。默认完整部署；`mode: frontend` 仅适用于明确只更新前端的场景。

使用自己的 SSH 密钥，公钥添加至服务器目标用户的 `~/.ssh/authorized_keys`。私钥保留在本机。可在本机 `~/.ssh/config` 配置 IdentityFile，或者使用 ssh-agent。首次手动 `ssh root@47.102.85.207`，通过云控制台核对服务器指纹后记录到 known_hosts。随后以下命令必须成功：

```powershell
ssh -i D:/Chrome/_codehive.pem -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes root@47.102.85.207 "echo connected"
```

脚本强制校验主机密钥并使用非交互认证，不自动接受未知指纹。

## 服务器一次性准备

先在云控制台或已登录的 SSH 中准备 Docker Engine、Docker Compose v2（支持 `up --wait`）、rsync、curl、tar、flock。遵循 [Docker 官方安装说明](https://docs.docker.com/engine/install/) 安装匹配服务器系统的版本。

保持现有宝塔站点根目录 `/www/wwwroot/codehive.asia`，启用有效 HTTPS。完整部署启动独立 PostgreSQL 容器，API 监听 `127.0.0.1:8100`。服务器的 8000 端口已由其他应用使用，部署保留该应用。本脚本不会把本机 SQLite 用户数据复制到生产。

```bash
# 在服务器取得此仓库后执行，仅需一次，可重复运行。
bash scripts/bootstrap-server.sh
```

初始化脚本会生成随机数据库密码，保存到权限为 600 的 `/etc/codehive/deploy.env`，并备份现有网站。配置已存在时不会覆盖。检查 SITE_ROOT 和 SITE_ORIGIN。配置文件同时供 Bash 与 Compose 读取，只放可信的简单字面值。数据库初始化后修改该值不会修改数据库中的密码，轮换需单独操作。

首次发布会在新 API 健康后自动安装站点扩展配置 `extension/codehive.asia/codehive-api.conf`，检查 Nginx 配置并重载。当前服务器实际使用 systemd 管理的系统 Nginx，配置位于 `/etc/nginx/bt-vhosts`；脚本会识别这个布局，通过 `systemctl reload nginx` 重载。普通宝塔安装则使用 `/www/server/panel/vhost/nginx`。可用 `NGINX_MODE=system` 或 `baota` 明确指定。API 保留 `/api/` 前缀，数据库只在 Docker 内网可访问，API 仅绑定服务器 `127.0.0.1:8100`。若已手动配置相同 location，先整合配置以避免重复。生产允许来源覆盖主域名与 `SITE_ALIAS_ORIGIN`，后者默认为 `https://www.codehive.asia`。

Python 与 PostgreSQL 使用 Docker 在 Amazon ECR Public 发布的官方镜像，避免服务器访问 Docker Hub 超时。来源说明见 [Docker 官方公告](https://www.docker.com/press-release/docker-official-images-available-amazon-elastic-container-registry/)。

首次部署完成后交互式创建管理员：

```bash
cd /www/codehive-deploy
export RELEASE_ID=$(cat current-fullstack)
docker compose --env-file /etc/codehive/deploy.env -f "releases/$RELEASE_ID/deploy/compose.yml" exec api python -m app.cli create-admin --username admin --display-name 管理员
```

密码通过 CLI 提示输入。当前 API 不信任转发 IP，代理后的用户共享 IP 限流额度；账号维度限流仍生效。若访问量增长，需要基于实际 Docker 网络设置可信代理范围后再启用转发头。

## GitHub 自动化

`.github/workflows/cicd.yml` 对 PR 和 master 推送运行前后端检查，使用真实 PostgreSQL 检查迁移、重复迁移及公开接口，并验证 Docker 构建。CI 业务测试目前仍基于 SQLite，PostgreSQL 并发业务回归尚未覆盖。

在 GitHub 创建 `production` environment，并配置：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Secret | CODEHIVE_SSH_KEY | 专用部署 SSH 私钥 |
| Secret | CODEHIVE_KNOWN_HOSTS | 已核对指纹的 known_hosts 条目 |
| Variable | CODEHIVE_SSH_HOST | root@47.102.85.207，可改为专用部署用户 |
| Variable | CODEHIVE_SSH_PORT | 22 |
| Repository variable | CODEHIVE_AUTO_DEPLOY | 设为 true 后 master 推送自动部署 |

推荐先使用本地发布，保持自动部署变量未设置。确认通路后，可在 Actions 中手动选择 master，勾选 deploy 触发，或启用推送自动部署。自动模式下日常只需提交和推送，避免同时运行本地 `npm run release` 造成重复发布。GitHub 路径不负责同步 Gitee，需要时正常推送 Gitee。配置行为参考 [GitHub 工作流语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。

## 失败处理与数据

服务器发布目录 `/www/codehive-deploy/releases` 保存完整版本，`backups` 保存数据库 pg_dump 和旧 index，`current` 记录通过验证的部署。部署锁避免同时操作；新 API 构建成功后才执行迁移与重启，前端最后发布。Compose 使用数据库健康检查控制启动顺序，见 [官方说明](https://docs.docker.com/compose/how-tos/startup-order/)。

公网首页必须与本次构建完全一致，`/api/competitions` 必须返回预期 JSON。CDN 若改写或缓存 HTML，需关闭首页缓存或增加刷新步骤，否则验证会失败。

失败会尝试恢复旧 index 和上一版 API 镜像。首次部署失败会停止新 API，保留数据库。固定文件名的静态资源可能已更新，入口恢复不等于完整资源恢复。数据库迁移不会自动回退，后续迁移必须兼容上一版应用；破坏性迁移应单独规划维护窗口。API 重启存在短暂不可用。异常中断或断电无法保证执行错误处理，需要检查 current、容器和备份。

数据库持久卷名 `codehive-postgres`，不要执行 `docker compose down -v`。数据库备份文件含个人信息，目录权限为 700，建议另行设置加密异地备份。版本、镜像和备份目前保留全部历史，需按磁盘容量制定保留周期。

## 本次交付状态

已验证私钥登录，完成服务器配置、原站点备份和官方基础镜像准备。本地私钥路径仅保存于被 Git 忽略的配置中。GitHub 远端自动部署仍需单独配置 environment secrets；本机一键部署通过本地 SSH 密钥运行。

发布结果以本次命令退出码、服务器 `/www/codehive-deploy/current` 记录及公网验证为准。仅生成脚本或通过语法检查无法确认上线成功。
