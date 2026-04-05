# CloudSaver Search

面向 `/tmp/workspaces/cloud189-auto-save` 的轻量搜索版 `CloudSaver`。

这个版本只保留两件事：

1. `POST /api/user/login` 登录拿 token
2. `GET /api/search` 搜索 Telegram 频道与雷鲸小站资源

其余转存、设置、豆瓣、赞助页等功能都不再作为运行链路的一部分。

## 兼容目标

`cloud189-auto-save` 当前通过以下方式接入：

- `POST /api/user/login`
- `GET /api/search`
- `Authorization: Bearer <token>`

这版接口继续保持兼容，并且搜索结果里的 `cloudLinks` 已调整为对象数组格式，`cloud189-auto-save` 可以直接消费。

## 环境变量

在 `backend/.env` 中配置：

```env
JWT_SECRET=replace_me
CLOUDSAVER_USERNAME=admin
CLOUDSAVER_PASSWORD=admin123456
TELEGRAM_BASE_URL=https://t.me/s
TELE_CHANNELS=[{"id":"xxx","name":"频道名"}]
PROXY_ENABLED=false
HTTP_PROXY_HOST=127.0.0.1
HTTP_PROXY_PORT=7890
```

说明：

- `CLOUDSAVER_USERNAME` / `CLOUDSAVER_PASSWORD` 是网页端和 `cloud189-auto-save` 登录用的账号密码
- `TELE_CHANNELS` 是搜索频道列表
- `TELE_CHANNELS` 留空或设置为 `[]` 时，会自动启用内置天翼频道：`tianyirigeng`、`cloudtianyi`、`tyypzhpd`、`tianyiDrive`、`tianyifc`、`tianyiyunpanpindao`、`yunpan189`
- 如果服务器访问 Telegram 需要代理，再打开 `PROXY_ENABLED`
- 雷鲸小站搜索当前内置启用，结果会以单独分组 `雷鲸小站` 返回

## 本地运行

```bash
npm install
npm run dev
```

默认端口是 `8009`。

## 接口示例

### 登录

```http
POST /api/user/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123456"
}
```

### 搜索

```http
GET /api/search?keyword=北上
Authorization: Bearer <token>
```

### 健康检查

```http
GET /api/health
```

## 返回数据说明

`/api/search` 返回分组结果，Telegram 频道和雷鲸小站都会遵循相同的 `cloudLinks` 结构：

```json
[
  {
    "cloudType": "tianyi",
    "link": "https://cloud.189.cn/xxxx"
  }
]
```

网页端会自动把它转换成普通字符串链接展示，`cloud189-auto-save` 则可以直接按对象格式处理。
