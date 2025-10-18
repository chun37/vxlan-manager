# VXLAN Machine Manager - Deployment Guide

## デプロイメント概要

このガイドでは、VXLAN Machine Managerを本番環境にデプロイする手順を説明します。

## 前提条件

### ハードウェア要件

- **CPU**: 2コア以上推奨
- **メモリ**: 最低4GB、推奨8GB (1000台監視時)
- **ディスク**: 最低10GB (ログ、データベース用)
- **ネットワーク**: VXLANネットワークへのアクセス

### ソフトウェア要件

- **OS**: Linux (Ubuntu 22.04 LTS推奨)
- **Docker**: 20.10以上
- **Docker Compose**: 2.0以上
- **Git**: バージョン管理用

## デプロイ方法

### Option 1: Docker Compose (推奨)

最も簡単で推奨される方法です。

#### 1. リポジトリのクローン

```bash
cd /opt
sudo git clone <repository-url> vxlan-manager
cd vxlan-manager
sudo git checkout 001-vxlan-machine-manager
```

#### 2. 環境変数の設定

```bash
sudo cp .env.example .env
sudo nano .env
```

`.env` ファイルを環境に合わせて編集:

```env
# Database
POSTGRES_USER=vxlan_admin
POSTGRES_PASSWORD=<STRONG_PASSWORD_HERE>  # ★変更必須
POSTGRES_DB=vxlan_manager
DATABASE_URL=postgresql+asyncpg://vxlan_admin:<STRONG_PASSWORD_HERE>@db:5432/vxlan_manager

# Application
API_HOST=0.0.0.0
API_PORT=8000
MAX_MACHINES=1000
MAX_PARALLEL_PINGS=100

# CORS (本番環境のドメインに変更)
CORS_ORIGINS=https://vxlan.example.com,https://192.168.100.1:3000

# Monitoring
PING_INTERVAL=60
PING_TIMEOUT=2
FAILURE_THRESHOLD=3

# Logging
LOG_LEVEL=INFO
```

#### 3. データベース初期化スクリプトの準備

データベース初期化スクリプトはすでに `database/init.sql` に含まれています。

#### 4. Docker Composeでサービス起動

```bash
sudo docker-compose up -d
```

サービス起動を確認:

```bash
sudo docker-compose ps
sudo docker-compose logs -f backend
```

#### 5. ヘルスチェック

```bash
curl http://localhost:8000/health
# Expected: {"status":"healthy","database":"connected"}
```

#### 6. Webブラウザでアクセス

http://localhost:3000 または http://<SERVER_IP>:3000

---

### Option 2: Systemd Service (Docker不使用)

Dockerを使わずにsystemdサービスとして直接実行する場合。

#### 1. PostgreSQLのインストール

```bash
sudo apt update
sudo apt install postgresql-14 postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### 2. データベースとユーザーの作成

```bash
sudo -u postgres psql
```

```sql
CREATE USER vxlan_admin WITH PASSWORD '<STRONG_PASSWORD>';
CREATE DATABASE vxlan_manager OWNER vxlan_admin;
GRANT ALL PRIVILEGES ON DATABASE vxlan_manager TO vxlan_admin;
\c vxlan_manager
\i /opt/vxlan-manager/database/init.sql
\q
```

#### 3. Pythonバックエンドのセットアップ

```bash
cd /opt/vxlan-manager/backend
sudo python3.11 -m venv venv
sudo venv/bin/pip install --upgrade pip
sudo venv/bin/pip install -e .
```

#### 4. Systemdサービスファイルの作成

`/etc/systemd/system/vxlan-backend.service`:

```ini
[Unit]
Description=VXLAN Manager Backend
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=vxlan
Group=vxlan
WorkingDirectory=/opt/vxlan-manager/backend
Environment=DATABASE_URL=postgresql+asyncpg://vxlan_admin:<PASSWORD>@localhost:5432/vxlan_manager
ExecStart=/opt/vxlan-manager/backend/venv/bin/uvicorn src.main:app --host 0.0.0.0 --port 8000

# CAP_NET_RAW capability for ICMP ping
AmbientCapabilities=CAP_NET_RAW
CapabilityBoundingSet=CAP_NET_RAW

Restart=always
RestartSec=10

# Resource limits
LimitNOFILE=10000
MemoryLimit=512M

[Install]
WantedBy=multi-user.target
```

#### 5. ユーザーとパーミッション

```bash
sudo useradd -r -s /bin/false vxlan
sudo chown -R vxlan:vxlan /opt/vxlan-manager
sudo setcap cap_net_raw+ep /opt/vxlan-manager/backend/venv/bin/python3.11
```

#### 6. サービス起動

```bash
sudo systemctl daemon-reload
sudo systemctl start vxlan-backend
sudo systemctl enable vxlan-backend
sudo systemctl status vxlan-backend
```

#### 7. フロントエンド (Nginx)

Nginxのインストール:

```bash
sudo apt install nginx
```

Nginxサイト設定 `/etc/nginx/sites-available/vxlan-manager`:

```nginx
server {
    listen 80;
    server_name vxlan.example.com;

    root /opt/vxlan-manager/frontend/src;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://localhost:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

サイト有効化:

```bash
sudo ln -s /etc/nginx/sites-available/vxlan-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## セキュリティ設定

### 1. ファイアウォール設定

```bash
# UFWの設定
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS (本番環境)
sudo ufw allow 8000/tcp   # API (内部のみの場合は不要)
sudo ufw enable
```

### 2. HTTPS/TLS設定 (本番環境必須)

Let's Encryptを使用:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d vxlan.example.com
sudo systemctl reload nginx
```

### 3. データベース暗号化パスワード

`.env` ファイルのパスワードを必ず変更してください:

```bash
# 強力なパスワード生成
openssl rand -base64 32
```

### 4. レート制限

レート制限はすでにミドルウェアで実装済み (120 req/min/IP)。
必要に応じて `backend/src/api/middleware.py` で調整可能。

---

## マシン登録スクリプトのデプロイ

各VXLANマシンで登録スクリプトを実行します。

### 1. スクリプトのコピー

```bash
# VXLANマネージャーサーバーから
scp /opt/vxlan-manager/docs/register-machine.sh user@<machine-ip>:/tmp/

# または、各マシンでダウンロード
wget http://<manager-server>/register-machine.sh
chmod +x register-machine.sh
```

### 2. 環境変数の設定

```bash
export VXLAN_MANAGER_URL="http://192.168.100.1:8000"  # VXLANマネージャーのIP
```

### 3. スクリプト実行

```bash
./register-machine.sh
```

### 4. Cron設定 (定期再登録)

マシン情報を定期的に更新する場合:

```bash
crontab -e
```

```cron
# 毎日午前2時に再登録
0 2 * * * VXLAN_MANAGER_URL="http://192.168.100.1:8000" /usr/local/bin/register-machine.sh >> /var/log/vxlan-register.log 2>&1
```

---

## 監視とログ

### ログの確認

**Docker環境**:
```bash
# バックエンドログ
sudo docker-compose logs -f backend

# すべてのサービス
sudo docker-compose logs -f
```

**Systemd環境**:
```bash
sudo journalctl -u vxlan-backend -f
```

### メトリクス監視

将来的にPrometheus/Grafanaを統合する場合:

1. `/metrics` エンドポイントを追加
2. Prometheusで収集
3. Grafanaでダッシュボード作成

### ヘルスチェック

定期的なヘルスチェック:

```bash
curl http://localhost:8000/health
```

Nagios/Zabbixなどの監視システムと統合可能。

---

## バックアップ

### データベースバックアップ

**自動バックアップスクリプト** (`/opt/backup-vxlan-db.sh`):

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups/vxlan-manager"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Docker環境
docker exec vxlan-manager-db-1 pg_dump -U vxlan_admin vxlan_manager > $BACKUP_DIR/vxlan_db_$DATE.sql

# 7日以上古いバックアップを削除
find $BACKUP_DIR -name "vxlan_db_*.sql" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/vxlan_db_$DATE.sql"
```

Cron設定:

```cron
0 3 * * * /opt/backup-vxlan-db.sh >> /var/log/vxlan-backup.log 2>&1
```

### リストア

```bash
# Docker環境
cat /opt/backups/vxlan-manager/vxlan_db_YYYYMMDD_HHMMSS.sql | \
  docker exec -i vxlan-manager-db-1 psql -U vxlan_admin vxlan_manager
```

---

## トラブルシューティング

### 問題: マシンが登録されない

**原因チェック**:
1. ネットワーク接続確認: `curl http://<manager-ip>:8000/health`
2. ファイアウォール確認: `sudo ufw status`
3. バックエンドログ確認: `docker-compose logs backend`

### 問題: Ping監視が動作しない

**原因チェック**:
1. CAP_NET_RAW権限確認: `getcap /usr/local/bin/python3.11`
2. icmplibインストール確認: `pip list | grep icmplib`
3. ログでPingエラー確認

### 問題: WebSocket接続が切断される

**原因チェック**:
1. Nginxタイムアウト設定確認: `proxy_read_timeout`
2. ファイアウォールでWebSocket許可確認
3. ブラウザコンソールでエラー確認

### 問題: データベース接続エラー

**原因チェック**:
1. PostgreSQL起動確認: `sudo systemctl status postgresql`
2. 接続文字列確認: `.env` ファイルの `DATABASE_URL`
3. パスワード確認

---

## アップグレード

### Docker環境

```bash
cd /opt/vxlan-manager
sudo git pull
sudo docker-compose down
sudo docker-compose up -d --build
```

### Systemd環境

```bash
cd /opt/vxlan-manager
sudo git pull
cd backend
sudo venv/bin/pip install -e .
sudo systemctl restart vxlan-backend
```

---

## パフォーマンスチューニング

### PostgreSQLチューニング

`/etc/postgresql/14/main/postgresql.conf`:

```conf
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 4MB
max_connections = 100
```

再起動:

```bash
sudo systemctl restart postgresql
```

### アプリケーションチューニング

`.env` ファイル:

```env
MAX_PARALLEL_PINGS=200  # CPU/ネットワーク帯域に応じて調整
PING_TIMEOUT=1          # より短いタイムアウト
```

---

## 本番環境チェックリスト

- [ ] 強力なデータベースパスワード設定
- [ ] HTTPS/TLS有効化
- [ ] ファイアウォール設定
- [ ] データベース自動バックアップ
- [ ] ログローテーション設定
- [ ] 監視システム統合
- [ ] CAP_NET_RAW権限設定
- [ ] CORS設定更新 (本番ドメイン)
- [ ] 環境変数ファイル保護 (`chmod 600 .env`)
- [ ] systemdサービス自動起動設定

---

## サポート

問題が発生した場合:
1. ログを確認 (`docker-compose logs` or `journalctl`)
2. `/health` エンドポイントを確認
3. GitHubでIssueを作成
