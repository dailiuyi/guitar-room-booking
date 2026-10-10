# 吉他社排练室预约 · 自托管版

一个排练室，每天北京时间 20:00–21:00，一组预约。访客填写姓名或乐队名，预约立即生效并公开显示；凭日期和随机取消码取消。没有账号、管理员界面或管理员接口。

前端使用 Next.js；数据库使用 Node.js 自带 SQLite，取消码只保存摘要，日期主键防止并发重复预约。应用不依赖 Sites、Cloudflare 或外部数据库，浏览器资源全部由本站提供。

## 本地运行

使用 Node.js 22.13 或更新版本。

```sh
npm ci
npm run build
npm start
```

打开 http://127.0.0.1:3100。默认数据库在 `data/bookings.sqlite`，请保留数据目录。

## 测试

```sh
npm test
TRUST_PROXY=1 npm start
node tests/api-check.mjs http://127.0.0.1:3100
```

API 测试会写入本地测试预约并清理，只允许 localhost 或 127.0.0.1，禁止用于公开生产服务。

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

维护命令：

```sh
systemctl status guitar-room --no-pager
journalctl -u guitar-room -n 50 --no-pager
systemctl restart guitar-room
nginx -t
```

备份 SQLite 应使用 SQLite backup API，包括正在使用 WAL 模式的数据库，不要只复制主文件。备份文件包含预约记录和取消码摘要，应私下保存。

自托管参考：[Next.js 官方指南](https://nextjs.org/docs/app/guides/self-hosting)。
