# Personal Dual-Node Deploy

这套模板给你的目标场景：

- `美国节点` 一台
- `香港节点` 一台
- 两台都跑同一个 `happy-server` 镜像
- 两台 **共用同一套后端存储**，从而保证数据一致性

## 关键原则

要做到“无感自动切换服务器，同时数据一致”，两台节点必须共用：

- 同一个 `PostgreSQL`
- 同一个对象存储 `S3 / MinIO`
- 同一个 `HANDY_MASTER_SECRET`
- 同一个 `Redis`（建议）

不要让美服和港服各自用自己的本地数据库，否则切换后会看到两套不同数据。

## 目录说明

- `docker-compose.node.yml`：节点通用模板
- `.env.us.example`：美国节点示例环境变量
- `.env.hk.example`：香港节点示例环境变量

## 推荐拓扑

- `us-api.acdji.asia` → 美国节点 `42.48.172.229`
- `hk-api.acdji.asia` → 香港节点 `154.64.252.34`
- `api.acdji.asia` → 统一入口域名

客户端优先配置 `api.acdji.asia`。真正的自动切换交给负载均衡层处理，App 里再保留美服/港服直连地址作为兜底。

## Cloudflare LB 是什么

Cloudflare Load Balancer（负载均衡）可以理解成：

- 你对外只暴露一个域名，比如 `api.acdji.asia`
- Cloudflare 持续检查美国节点和香港节点是否健康
- 美国节点挂了，它会自动把流量切到香港节点
- 美国节点恢复后，可以继续作为主节点或备节点

这样：

- `App / CLI` 不需要感知“现在到底连的是美国还是香港”
- 自动切换更平滑
- 更适合你要的“无感”

如果你不用 Cloudflare LB，也可以用：

- Nginx Plus
- HAProxy
- 自己的 DNS 健康检查方案

但 Cloudflare LB 的优点是：

- 配置简单
- 有全球 DNS 能力
- 很适合双地域入口

## DNS 解析建议

先在 `acdji.asia` 的 DNS 里加：

```text
us-api.acdji.asia  A      42.48.172.229
hk-api.acdji.asia  A      154.64.252.34
api.acdji.asia     CNAME  Cloudflare LB 分配的统一入口
```

如果暂时不用 Cloudflare LB，也可以先让：

```text
api.acdji.asia     CNAME  us-api.acdji.asia
```

这样 App 仍然可以把 `hk-api.acdji.asia` 作为备用节点兜底。

## 部署前准备

你需要先准备好共享资源：

### 1. PostgreSQL

例如：

```env
DATABASE_URL=postgresql://happy:password@db.example.com:5432/happy
```

### 2. Redis

例如：

```env
REDIS_URL=redis://redis.example.com:6379
```

### 3. S3 / MinIO

例如：

```env
S3_HOST=minio.example.com
S3_PORT=443
S3_USE_SSL=true
S3_REGION=us-east-1
S3_BUCKET=happy
S3_ACCESS_KEY=xxx
S3_SECRET_KEY=xxx
S3_PUBLIC_URL=https://files.acdji.asia/happy
```

### 4. 主密钥

两台节点必须完全一样：

```env
HANDY_MASTER_SECRET=请换成你自己的超长随机字符串
```

## 部署步骤

### 美国节点

```bash
cp .env.us.example .env
docker compose --env-file .env -f docker-compose.node.yml up -d --build
```

### 香港节点

```bash
cp .env.hk.example .env
docker compose --env-file .env -f docker-compose.node.yml up -d --build
```

两边除了 `PUBLIC_URL`、`NODE_NAME`、`HAPPY_NODE_ID`、`HAPPY_NODE_REGION` 之外，其它共享资源变量都必须一致。

## 健康检查

部署后检查：

```bash
curl http://127.0.0.1:3005/health
curl https://us-api.acdji.asia/health
curl https://hk-api.acdji.asia/health
curl https://api.acdji.asia/health
```

健康检查会返回当前节点信息，便于 App/CLI 判断命中了哪个节点，例如：

```json
{
  "status": "ok",
  "service": "happy-server",
  "node": {
    "nodeId": "happy-us",
    "region": "us",
    "role": "app"
  }
}
```

## 客户端建议

### 最佳方案

客户端统一填：

```text
https://api.acdji.asia
```

然后由 Cloudflare LB 自动在 `us-api` 和 `hk-api` 之间切换。

如果还没有 Cloudflare LB，App 里先这样填：

```text
统一入口：https://us-api.acdji.asia
美国节点：https://us-api.acdji.asia
香港节点：https://hk-api.acdji.asia
```

Cloudflare LB 建议：

- 健康检查路径填 `/health`
- 主域名指向 `api.acdji.asia`
- 回源池包含 `us-api.acdji.asia` 和 `hk-api.acdji.asia`
- 故障摘除后自动恢复回切

### 退而求其次

如果暂时不上 LB：

- App / CLI 里保留主备地址
- 主地址失败后切备地址

但这仍然不如统一入口域名稳。

## 备注

- 这份模板只部署应用节点，不在节点本机启动数据库
- 因为你要的是“双节点共享数据”，数据库/对象存储应该单独托管
- 如果你后面要，我可以继续帮你补：
  - `Cloudflare LB` 配置步骤
  - `Nginx` 反代模板
  - `App + CLI` 主备自动切换逻辑
