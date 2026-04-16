#!/usr/bin/env sh
set -eu

gen() {
  openssl rand -base64 48 | tr '+/' '-_' | tr -d '=' | tr -d '\n'
}

cat <<EOF
HANDY_MASTER_SECRET=$(gen)
POSTGRES_PASSWORD=$(gen)
REDIS_PASSWORD=$(gen)
MINIO_ROOT_USER=happyminio
MINIO_ROOT_PASSWORD=$(gen)
S3_ACCESS_KEY=happyminio
S3_SECRET_KEY=$(gen)
EOF
