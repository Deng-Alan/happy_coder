# Personal Dual-Node Deploy

这套模板已经按你的场景整理好了：

- 美国节点：`42.48.172.229`
- 香港节点：`154.64.252.34`
- 域名：`acdji.asia`
- 主用端：`App`
- 架构：`美国共享基础设施 + 美国应用节点 + 香港应用节点 + 自动切换`

## 最终拓扑

- `api.acdji.asia` → 当前先指向美国节点，后续可切 Cloudflare LB
- `us-api.acdji.asia` → 美国 Happy Server
- `hk-api.acdji.asia` → 香港 Happy Server
- `files.acdji.asia` → 美国 MinIO 文件出口
- `minio-console.acdji.asia` → 美国 MinIO 管理台

美国节点跑：

- `Postgres`
- `Redis`
- `MinIO`
- `happy-server`
- `Caddy`

香港节点跑：

- `happy-server`
- `Caddy`

## 目录说明

- `.env.shared.example`：美国共享基础设施配置
- `.env.us.example`：美国 Happy Server 配置
- `.env.hk.example`：香港 Happy Server 配置
- `docker-compose.shared.yml`：美国共享基础设施
- `docker-compose.node.yml`：Happy Server 节点模板
- `docker-compose.edge.us.yml`：美国 HTTPS 入口
- `docker-compose.edge.hk.yml`：香港 HTTPS 入口
- `Caddyfile.us`：美国反向代理规则
- `Caddyfile.hk`：香港反向代理规则
- `generate-secrets.sh`：一键生成主密钥和密码

## DNS 先这样配

```text
us-api.acdji.asia         A      42.48.172.229
hk-api.acdji.asia         A      154.64.252.34
files.acdji.asia          A      42.48.172.229
minio-console.acdji.asia  A      42.48.172.229
api.acdji.asia            CNAME  us-api.acdji.asia
```

等后面你要上 Cloudflare LB，再把 `api.acdji.asia` 改成 LB 统一入口。

## 第一步：生成密码

在美国服务器执行：

```bash
cd happy_coder/deploy/personal-dual-node
chmod +x generate-secrets.sh
./generate-secrets.sh
```

它会输出：

```env
HANDY_MASTER_SECRET=...
POSTGRES_PASSWORD=...
REDIS_PASSWORD=...
MINIO_ROOT_USER=happyminio
MINIO_ROOT_PASSWORD=...
S3_ACCESS_KEY=happyminio
S3_SECRET_KEY=...
```

把这些值保存好，后面三份 `.env` 都要用到。

## 第二步：美国服务器部署

### 1. 共享基础设施

```bash
cp .env.shared.example .env.shared
nano .env.shared
```

至少把这些值替换掉：

```env
POSTGRES_PASSWORD=你刚生成的 POSTGRES_PASSWORD
REDIS_PASSWORD=你刚生成的 REDIS_PASSWORD
MINIO_ROOT_PASSWORD=你刚生成的 MINIO_ROOT_PASSWORD
S3_PUBLIC_URL=https://files.acdji.asia/happy
```

启动：

```bash
docker compose --env-file .env.shared -f docker-compose.shared.yml up -d
```

### 2. 美国 Happy Server

```bash
cp .env.us.example .env
nano .env
```

把下面几项替换成你刚生成的值：

```env
HANDY_MASTER_SECRET=你刚生成的 HANDY_MASTER_SECRET
DATABASE_URL=postgresql://happy:你的 POSTGRES_PASSWORD@42.48.172.229:5432/happy
REDIS_URL=redis://:你的 REDIS_PASSWORD@42.48.172.229:6379
S3_SECRET_KEY=你的 S3_SECRET_KEY
```

启动：

```bash
docker compose --env-file .env -f docker-compose.node.yml -f docker-compose.edge.us.yml up -d --build
```

## 第三步：香港服务器部署

```bash
cd happy_coder/deploy/personal-dual-node
cp .env.hk.example .env
nano .env
```

把下面几项替换成和美国**完全一样**的值：

```env
HANDY_MASTER_SECRET=和美国相同
DATABASE_URL=postgresql://happy:同一个 POSTGRES_PASSWORD@42.48.172.229:5432/happy
REDIS_URL=redis://:同一个 REDIS_PASSWORD@42.48.172.229:6379
S3_SECRET_KEY=和美国相同
```

启动：

```bash
docker compose --env-file .env -f docker-compose.node.yml -f docker-compose.edge.hk.yml up -d --build
```

## 健康检查

美国服务器：

```bash
docker compose --env-file .env.shared -f docker-compose.shared.yml ps
docker compose --env-file .env -f docker-compose.node.yml -f docker-compose.edge.us.yml ps
curl http://127.0.0.1:3005/health
curl https://us-api.acdji.asia/health
curl https://files.acdji.asia/minio/health/live
```

香港服务器：

```bash
docker compose --env-file .env -f docker-compose.node.yml -f docker-compose.edge.hk.yml ps
curl http://127.0.0.1:3005/health
curl https://hk-api.acdji.asia/health
```

统一入口：

```bash
curl https://api.acdji.asia/health
```

健康检查会返回节点信息，类似：

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

## App 里怎么填

在手机 App 里先填：

```text
统一入口：https://api.acdji.asia
美国节点：https://us-api.acdji.asia
香港节点：https://hk-api.acdji.asia
```

如果现在 `api.acdji.asia` 还只是 CNAME 到美国节点，也没关系，香港节点仍会作为备用节点。

## 防火墙建议

美国节点需要允许香港节点访问：

- `5432`（Postgres）
- `6379`（Redis）

强烈建议只对白名单 `154.64.252.34` 放行，不要对全网开放。

你也可以先粗暴跑通，再回头收紧：

```bash
ufw allow 80
ufw allow 443
ufw allow 5432
ufw allow 6379
ufw enable
```

## 以后升级 Cloudflare LB

你准备上 Cloudflare LB 时：

- 主域名：`api.acdji.asia`
- 回源池：`us-api.acdji.asia`、`hk-api.acdji.asia`
- 健康检查路径：`/health`

到那时 App 配置不用改，直接继续用：

```text
https://api.acdji.asia
```
