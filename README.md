# 吉他社排练室预约 · 自托管版

一个排练室，每天北京时间 08:00–21:00，按一小时切分为 13 个时段，每个时段一组预约。访客填写姓名或乐队名，预约立即生效并公开显示；凭日期、时段和随机取消码取消。取消码保存在当前浏览器，忘记时可联系管理员，由管理员输入通用密钥协助取消。无需账号。

前端使用 Next.js；数据库使用 Node.js 自带 SQLite，取消码只保存摘要，日期与开始时间的联合主键防止同一时段并发重复预约。应用不依赖 Sites、Cloudflare 或外部数据库，浏览器资源全部由本站提供。

## 本地运行

使用 Node.js 22.13 或更新版本。

```sh
npm ci
npm run build
npm start
```

打开 http://127.0.0.1:3100。默认数据库在 `data/bookings.sqlite`，请保留数据目录。

## 取消码与管理员协助

先选择日期，再选择 08:00–09:00、09:00–10:00，依次至 20:00–21:00 的时段。每个小时独立预约和取消，同一天可以有多组预约。沿用原规则：时段结束后停止新预约，已经开始但尚未结束的时段仍可预约。

预约与取消 API 的 JSON 必须指定 `date` 和 `slotStart`（例如 `"08:00"`）；结束时间由服务器确定。公开排期返回 `slots` 列表，每条预约包含 `slotStart`。

首次访问新版本的预约 API 时，数据库会在事务内自动升级为日期与开始时间的联合主键，原有记录保留为 20:00–21:00，姓名、创建时间和取消码摘要不变。旧个人取消码继续有效，旧浏览器保存的码仅用于 20:00 时段。升级前请备份数据库；旧程序不支持升级后的表结构，回退版本时需恢复相应备份。

- 个人取消码按日期与时段分别保存到本站的 `localStorage`，取消时自动填入，成功取消后清除。已确认的取消码绑定预约创建时间，避免填入同一天旧预约的取消码；请求结果不确定时也保留本次尝试的码。
- 保存失败不影响预约，成功提示会提醒手动备份。换设备、换浏览器、清除网站数据或隐私模式都可能无法读取原码；同一浏览器的其他使用者也可能读取它。
- 在取消窗口选择「管理员协助取消」，核实身份、日期、时段和姓名后输入密钥并勾选确认。管理员密钥不会保存到浏览器。服务器核对创建时间和姓名，预约已变更时要求刷新，不会取消替换后的预约。
- 服务器环境变量 `ADMIN_CANCELLATION_KEY` 启用此功能，长度为 32–256 个字符，建议使用随机生成的 32 字节十六进制值；未配置或长度不合要求时拒绝管理员取消。个人取消不受影响。

生成密钥（只在管理员的私密终端运行，勿把结果提交到 Git）：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

本地可在 `.env.local` 中设置 `ADMIN_CANCELLATION_KEY=<生成的密钥>` 并重启应用。Linux 部署使用 `/etc/guitar-room.env`（root 所有、权限 `0600`），填写同名变量；将更新后的 systemd 单元安装后执行 `systemctl daemon-reload` 和 `systemctl restart guitar-room`。更换该文件中的密钥并重启即可轮换，旧密钥随即失效。只交给管理员，不发送给预约人，不使用 `NEXT_PUBLIC_` 前缀。

管理员请求沿用来源校验，并单独限制每分钟 20 次；未启用可信代理时使用服务级共享限额。生产环境仍须由 Nginx 覆盖真实 IP 请求头并通过 HTTPS 访问。

## 测试

```sh
npm test
TRUST_PROXY=1 npm start
node tests/api-check.mjs http://127.0.0.1:3100
```

API 测试会写入本地测试预约并清理，只允许 localhost 或 127.0.0.1，禁止用于公开生产服务。

使用独立的 `DATABASE_PATH`，并在本地服务和 API 测试进程设置相同的测试专用 `ADMIN_CANCELLATION_KEY`，可额外验证管理员取消、错误密钥、预约变更保护和管理员限流。不要使用生产密钥。未设置测试密钥时，API 测试验证管理员功能未启用时拒绝访问。

## 当前服务器部署

- 域名：`https://guitar.elma-gohan.xyz`
- 源码：`/opt/guitar-room/source/<版本>/`
- 发布包：`/opt/guitar-room/releases/<版本>/`
- 当前服务目录：`/opt/guitar-room/current`
- 数据库：`/var/lib/guitar-room/bookings.sqlite`
- systemd：`guitar-room.service`，使用专用非 root 用户，仅监听 `127.0.0.1:3100`
- Nginx：`/etc/nginx/conf.d/guitar-room.conf`
- 证书：`/etc/letsencrypt/live/guitar.elma-gohan.xyz/`

发布时在 Linux 上执行 `npm ci`、`npm run build`，将 `.next/standalone/` 的内容复制到新发布目录，再将 `.next/static/` 放到发布目录 `.next/static/`。用 `current` 链接切换版本后重启自己的服务。数据库位于发布目录之外，升级不得替换或删除。

升级已有服务时，将 Git 源码归档上传为 `/tmp/guitar-room-source-<版本>.tar.gz`，运行 `sh deploy/build-release.sh <版本>` 构建独立发布目录，再运行新源码目录中的 `sh deploy/update-release.sh <版本>`。升级脚本会暂停写入、使用 SQLite backup API 备份数据库、私密配置管理员密钥、切换服务并核对 13 个时段及原预约。失败时自动恢复备份和旧服务；成功后保留 `/var/lib/guitar-room/backups/` 中的备份。`activate.sh` 仅用于首次安装。

维护命令：

```sh
systemctl status guitar-room --no-pager
journalctl -u guitar-room -n 50 --no-pager
systemctl restart guitar-room
nginx -t
```

备份 SQLite 应使用 SQLite backup API，包括正在使用 WAL 模式的数据库，不要只复制主文件。备份文件包含预约记录和取消码摘要，应私下保存。

自托管参考：[Next.js 官方指南](https://nextjs.org/docs/app/guides/self-hosting)。
