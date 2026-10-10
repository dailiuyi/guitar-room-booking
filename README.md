# MUC 音协 · 吉他排练室预约系统

> **民谣诗意 · 热血摇滚**  
> 中央民族大学音乐协会（MUC 音协）排练室专属自托管预约系统。由 [n-bunana (Elma)](https://elma-gohan.xyz) 设计与维护。


## 🚀 本地开发与运行

要求环境：**Node.js 22.13.0** 或更高版本。

```sh
# 1. 安装依赖
npm ci

# 2. 生产打包构建
npm run build

# 3. 运行服务（监听 127.0.0.1:3100）
npm start
```

访问 `http://127.0.0.1:3100`。本地默认数据库存储于 `data/bookings.sqlite`。

---

## 🛠️ API 与数据接口

### 1. 排期与预约接口 (`/api/bookings`)
- `GET /api/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD`：获取指定日期范围内的排期与预约名单。
- `POST /api/bookings`：提交预约（需传 `date`、`slotStart`、`name`）。
- `DELETE /api/bookings`：取消预约（需传 `date`、`slotStart` 以及个人取消码或管理员密钥）。

### 2. 需求与意见反馈接口 (`/api/feedback`)
- `POST /api/feedback`：前端提交需求（包含 `contact` 联系方式与 `content` 详细内容，限频保护）。
- `GET /api/feedback`：管理端 / 机器人数据拉取（按倒序返回最新 100 条）。
  - **鉴权方式**：需在请求头带上 `x-admin-key: <ADMIN_CANCELLATION_KEY>` 或 URL Query 参数 `?adminKey=...`。
  - **调用示例**（供 Grokbot 定期轮询）：
    ```sh
    curl -H "x-admin-key: YOUR_ADMIN_KEY" https://guitar.elma-gohan.xyz/api/feedback
    ```

---

## 🔐 密钥与安全管理

服务器环境变量 `ADMIN_CANCELLATION_KEY` 控制管理员协助退订与反馈数据读取权限（长度 32–256 字符）。

在 Linux 生产环境中，密钥存储于 `/etc/guitar-room.env`（权限 `0600`，由 root 所有），重启服务即可动态轮换。

查看生产服务器当前密钥：
```sh
ssh elma-gohan "cat /etc/guitar-room.env"
```

---

## 🧪 自动化测试

```sh
# 运行单元规则、时区边界、数据库 Schema 与管理员密钥测试
npm test

# 本地联调 API 检查（会创建并清理临时测试数据）
TRUST_PROXY=1 npm start
node tests/api-check.mjs http://127.0.0.1:3100
```

---

## 🌐 生产服务器与发布架构

- **线上地址**：`https://guitar.elma-gohan.xyz`
- **代码源码**：`/opt/guitar-room/source/<版本>/`
- **发布构建**：`/opt/guitar-room/releases/<版本>/`
- **软链切换**：`/opt/guitar-room/current`
- **数据库路径**：`/var/lib/guitar-room/bookings.sqlite`（跨版本独立持久化）
- **Systemd 服务**：`guitar-room.service`（监听 `127.0.0.1:3100`）
- **反向代理**：Nginx HTTPS + Let's Encrypt 证书

---

## 👤 作者与维护

- **开发者**：Elma ([n-bunana](https://elma-gohan.xyz))
- **个人主页 / 博客**：[elma-gohan.xyz](https://elma-gohan.xyz)
- **GitHub**：[@dailiuyi](https://github.com/dailiuyi)
- **组织机构**：中央民族大学音乐协会（MUC 音协）
