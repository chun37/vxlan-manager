FROM python:3.11-slim

# システムパッケージのインストール
RUN apt-get update && apt-get install -y \
    libcap2-bin \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存関係のインストール
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -e .[dev]

# アプリケーションコードのコピー
COPY . .

# CAP_NET_RAWケーパビリティを付与(ICMP ping用)
RUN setcap cap_net_raw+ep /usr/local/bin/python3.11

# 非rootユーザーで実行
RUN useradd -m -u 1000 vxlan && chown -R vxlan:vxlan /app
USER vxlan

# デフォルトコマンド
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
