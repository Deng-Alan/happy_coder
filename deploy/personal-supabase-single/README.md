# Personal Supabase Single-Server Deploy

这是给 `2核2G` 服务器用的低内存部署方案：

- GitHub Actions 构建 Docker 镜像
- 服务器只 `pull` 镜像并运行，不在服务器上 build
- 数据库用 Supabase Postgres
- 文件暂时使用服务器本地 Docker volume
- 不跑 Redis / MinIO / 本地 Postgres

## 1. DNS

先把域名指向服务器：

```text
api.acdji.asia  A  你的服务器公网 IP
```

## 2. 等 GitHub Actions 构建镜像

推送到 `main` 后，GitHub 会自动构建：

```text
ghcr.io/deng-alan/happy_coder-server:latest
```

在 GitHub 仓库的 `Actions` 页面确认 `Build Server Image` 成功。

如果 GHCR 包是私有的，先在 GitHub 页面把 package visibility 改成 Public；或者在服务器上 `docker login ghcr.io`。

## 3. Supabase 连接串

在 Supabase 后台复制：

```text
Settings -> Database -> Connection string -> Direct connection
```

格式类似：

```env
postgresql://postgres.xxxxx:你的密码@db.xxxxx.supabase.co:5432/postgres?sslmode=require
```

## 4. 服务器准备

先加 swap，避免 2G 内存太紧：

```bash
fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

安装 Docker：

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
docker --version
docker compose version
```

## 5. 部署

```bash
cd ~/happy_coder/deploy/personal-supabase-single
cp .env.example .env
nano .env
```

填：

```env
IMAGE=ghcr.io/deng-alan/happy_coder-server:latest
PUBLIC_URL=https://api.acdji.asia
HANDY_MASTER_SECRET=你自己生成的长随机字符串
DATABASE_URL=你的 Supabase Direct connection string
```

生成主密钥可用：

```bash
openssl rand -base64 48 | tr '+/' '-_' | tr -d '='
```

启动：

```bash
docker compose pull
docker compose up -d
```

## 6. 检查

```bash
docker compose ps
curl http://127.0.0.1:3005/health
curl https://api.acdji.asia/health
```

## 7. 更新

以后每次代码推送后，等 GitHub Actions 构建成功，在服务器执行：

```bash
cd ~/happy_coder/deploy/personal-supabase-single
docker compose pull
docker compose up -d
```
