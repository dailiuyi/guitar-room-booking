# MUC 音协 · 吉他排练室预约系统

> **民谣诗意 · 热血摇滚**  
> 中央民族大学音乐协会（MUC 音协）排练室专属自托管预约系统。由 [n-bunana (Elma)](https://elma-gohan.xyz) 设计与维护。

---

## 🌟 项目特性

- **13 个独立黄金时段**：每日北京时间 08:00 – 21:00，按 1 小时精确切分，每个时段单组独占。
- **免登录即时预约**：填写姓名或乐队名即刻生效并公开显示；凭随机 16 位凭证码（取消码）自行退订。
- **微质感 Editorial 设计**：
  - 继承作者个人博客（[elma-gohan.xyz](https://elma-gohan.xyz)）的纸质底色与噪点纹理系统（Fractal Noise），告别千篇一律的 AI 模板感。
  - 森林墨绿（`#3f5f59` / `#5d6d5a`）高辨识度点缀与清晰排版节奏。
  - 移动端专门优化：单屏紧凑横向条目，避免繁冗滚动。
- **意见与需求反馈箱**：
  - 页面右下角常驻磨砂玻璃悬浮药丸胶囊（`✎ 提需求 / 意见反馈`）；
  - 数据安全沉淀至本地 SQLite `feedback` 数据表；
  - 开放管理级查询接口，便于机器人（如 Grokbot）或管理员定期拉取社员需求与器材建议。
- **零外部依赖自托管**：
  - 基于 Next.js 独立单体架构（Standalone Output）与 Node.js 原生 SQLite（WAL 模式）；
  - 取消码服务器端仅存 SHA-256 加盐摘要，不暴露明文；
  - 支持管理员密钥（`ADMIN_CANCELLATION_KEY`）协助模式与防暴力频控限制。

---

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
