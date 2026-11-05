# 宝塔站点更新与部署

完整前后端发布现已提供 `npm run release`，配置步骤见 [CI/CD 使用说明](cicd.md)。本文以下保留旧版前端发布方式；启用完整发布后，停用运行 `deploy-bt.sh` 的宝塔计划任务，避免旧流程覆盖完整版本。

本仓库的前端由 Vite 构建，宝塔站点 `codehive.asia` 的网站根目录是 `/www/wwwroot/codehive.asia`。发布时应把 `dist/` 中的静态文件放进网站根目录。`scripts/deploy-bt.sh` 会在服务器上拉取 Gitee 的 `master`、安装依赖、构建、运行前端测试与代码检查，然后发布静态文件。

## 第一次在服务器上准备

在阿里云 Workbench 终端执行。脚本需要 Git、Node.js、npm、rsync 和 flock。Node.js 版本需满足 `^20.19.0 || >=22.12.0`，建议使用当前维护中的 22 或更新版本。先检查：

```bash
git --version
node --version
npm --version
rsync --version
command -v flock
```

如果终端出现单独的 `>` 提示符，先按 `Ctrl+C`，再逐行输入命令。不要把 Markdown 的代码围栏复制到终端。

截图中的服务器已安装 Git 和 flock，缺少 Node.js、npm 与 rsync。若 `cat /etc/os-release` 确认系统使用 RPM 和 dnf，可用 root 账号安装：

```bash
cat /etc/os-release
dnf install -y curl rsync
curl -fsSL https://rpm.nodesource.com/setup_22.x -o /root/nodesource_setup.sh
bash /root/nodesource_setup.sh
dnf install -y nodejs
node --version
npm --version
rsync --version
```

Node.js 22 的 RPM 安装步骤参考 [NodeSource 官方仓库](https://github.com/nodesource/distributions)。安装完毕后再继续克隆仓库。宝塔计划任务也需要能在 PATH 中找到 `node`、`npm` 和 `rsync`。

确保宝塔中 `codehive.asia` 的网站根目录确实是 `/www/wwwroot/codehive.asia`。把仓库克隆到网站根目录之外，然后首次运行：

```bash
cd /www
git clone --branch master https://gitee.com/lichuanjie31/codehive-community-website.git codehive-community-website
cd /www/codehive-community-website
bash scripts/deploy-bt.sh
```

如果宝塔中的根目录不同，运行时设置 `SITE_ROOT`，例如：

```bash
SITE_ROOT=/www/wwwroot/你的站点目录 bash scripts/deploy-bt.sh
```

脚本要求仓库没有本地修改，且当前处于 `master` 分支。它使用快进合并；如果服务器仓库有独立提交或改动，脚本会停止，避免覆盖。首次部署前可以把宝塔网站目录已有文件自行备份。脚本每次会把旧版 `index.html` 保存到 `/www/backup/codehive.asia`，保留旧资源文件，以便回退入口页面。旧资源会持续占用磁盘空间，日后可按实际情况清理。

## 以后每次更新

先在自己的电脑上修改代码，检查并只暂存要发布的文件：

```powershell
git status --short
git add src public README.md
git commit -m "更新网站内容"
git push gitee master
```

上面的 `git add` 是内容更新示例。改动其他目录时，明确添加对应路径。不要直接暂存本地凭据或后端 `.env`。如果首次要把本次部署脚本也推送到 Gitee：

```powershell
git add .gitignore scripts/deploy-bt.sh docs/baota-deploy.md
git commit -m "添加宝塔自动部署脚本"
git push gitee master
```

推送完成后，在服务器运行一条命令：

```bash
cd /www/codehive-community-website && bash scripts/deploy-bt.sh
```

每次运行都会拉取最新代码并发布。也可在宝塔计划任务中把上面这条命令设为 Shell 脚本，按所需频率执行。计划任务会在仓库有更新时重新构建；即使没有新提交，也会重复构建。查看运行结果时，先检查计划任务日志和终端输出。

## 回退前端页面

在 `/www/backup/codehive.asia` 找到部署前保存的 `index-时间-提交.html`。确认要回退的文件后，复制到网站目录的 `index.html`。脚本会保留旧版带哈希的 JS 和 CSS 文件。使用固定文件名的图片等资源可能已被新版覆盖；需要完整回退时，应使用部署前制作的全站备份。重新运行部署脚本会发布当前 Gitee `master`。

## 后端功能

当前代码含 FastAPI 后端，比赛资料、账号、收藏和订阅等页面会请求 `/api`。上述脚本只发布前端静态文件。要启用这些功能，还需在服务器配置 PostgreSQL、后端生产环境变量、FastAPI 常驻服务、宝塔 Nginx 的 `/api` 反向代理和数据库备份。后端的生产约束见 [第二版开发手册](member-access-v2.md)。在这些条件未配置前，公开静态页面可以更新，依赖 `/api` 的功能无法正常使用。
