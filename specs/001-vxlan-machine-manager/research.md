# ICMP Pingモニタリング - Asyncio実装のベストプラクティス

## エグゼクティブサマリー

本ドキュメントは、最大1000台のマシンを同時監視するVXLANマシンマネージャー向けの、Pythonにおける非同期ICMPピング実装のベストプラクティスをまとめたものです。

### 主要な推奨事項

1. **Pingライブラリ**: `icmplib`の`async_ping`を使用（`asyncio.create_subprocess_exec`より推奨）
2. **並行処理パターン**: `asyncio.Semaphore`で並列実行を100に制限
3. **タスク管理**: 個別の長期実行タスクとして各マシンを監視、手動ライフサイクル管理
4. **エクスポネンシャルバックオフ**: カスタム実装（既存の失敗カウントベース）

---

## 1. Asyncio Ping実装オプション

### 決定: icmplibライブラリの使用

**選択**: 本プロジェクトでは`icmplib`の`async_ping`関数を使用することを推奨します。

### 根拠

#### icmplibの利点

1. **モダンな設計**
   - Python 3.7+の最新機能を活用
   - フルオブジェクト指向設計
   - ピュアPython実装（外部依存なし）

2. **パフォーマンス**
   - 非ブロッキングな`async_ping`と`async_multiping`関数
   - `async_multiping`はデフォルトで50の並行タスクをサポート（調整可能）
   - asyncioに最適化された設計

3. **柔軟性**
   - rootなしでの実行オプション（特定の設定で）
   - タイムアウト、パケット数、ペイロードサイズなど細かい設定が可能
   - Linux、macOS、Windows対応

4. **リターン値の充実**
   ```python
   host = await async_ping('192.168.1.1', timeout=2, count=1)
   # host.address, host.is_alive, host.avg_rtt, host.packet_loss など
   ```

5. **アクティブメンテナンス**
   - 2024年時点で活発に開発されている
   - 定期的なアップデートとバグフィックス

#### 代替案の評価

##### A. asyncio.create_subprocess_exec（システムpingコマンド）

**利点**:
- rootアクセス不要（system pingはSUID設定済み）
- シェルインジェクションのリスクが少ない
- 実装がシンプル

**欠点**:
- パフォーマンスが大幅に低い（255秒対数秒の報告あり）
- 各pingでプロセスを起動するオーバーヘッド
- OSごとに異なるping出力のパース処理が必要
- エレガントでない実装

**判定**: 1000台の同時監視には不適切。パフォーマンスが重大なボトルネックになる。

##### B. aiopingライブラリ

**利点**:
- asyncio専用設計
- ピュアPython実装

**欠点**:
- icmplibほど機能が充実していない
- メンテナンスが不活発（複数のフォークが存在）
- ドキュメントが少ない
- 戻り値が単純（遅延のみ、またはエラー）

**判定**: icmplibの方が優れている。より多機能で活発にメンテナンスされている。

### コード例

```python
import asyncio
from icmplib import async_ping

async def ping_host(address: str) -> bool:
    """
    単一ホストへの非同期ping

    Args:
        address: pingするIPアドレスまたはホスト名

    Returns:
        ホストが応答した場合True、そうでない場合False
    """
    try:
        host = await async_ping(
            address,
            count=1,           # 1パケットのみ送信
            timeout=2,         # 2秒のタイムアウト
            privileged=True    # rootが必要（またはFalseでUDPモード）
        )
        return host.is_alive
    except Exception as e:
        # エラーはダウンとして扱う
        print(f"Error pinging {address}: {e}")
        return False
```

### インストールと権限

```bash
# インストール
pip install icmplib

# rootなしでの実行（UDPモード、privileged=False）
# または、rootとして実行（privileged=True）
```

**権限に関する注意事項**:
- `privileged=True`: raw ICMPソケットが必要（root権限またはCAP_NET_RAW）
- `privileged=False`: UDPソケット経由（厳密なICMPではない）
- 本番環境では、systemdサービスとして適切な権限で実行することを推奨

---

## 2. 並行実行パターン

### 決定: セマフォベースの並行制御 + 個別長期実行タスク

### 根拠

1000台のマシンを同時監視する場合、各マシンに対して独立した長期実行タスクを作成し、セマフォで並列ping操作を制限します。

#### メモリフットプリント分析

**調査結果**:
- 100万asyncioタスク = 約1GiB（タスクあたり約1KiB）
- 100万コルーチンのみ = 約550MiB（コルーチンあたり0.55KiB）
- **1000タスクの場合**: 約1MB程度、完全に許容範囲

#### アーキテクチャパターン

```python
import asyncio
from typing import Dict
from dataclasses import dataclass
from datetime import datetime

@dataclass
class MachineMonitor:
    """マシンモニタリング状態"""
    machine_id: int
    ip_address: str
    consecutive_failures: int = 0
    next_check_interval: int = 60  # 秒
    last_check: datetime = None
    is_alive: bool = None

# グローバルセマフォ - 並列ping操作を制限
PING_SEMAPHORE = asyncio.Semaphore(100)

async def monitor_machine(monitor: MachineMonitor, db_pool):
    """
    単一マシンの長期実行監視タスク

    このコルーチンは、マシンが削除されるかサービスが停止するまで
    無限に実行されます。
    """
    while True:
        try:
            # セマフォで並列ping数を制限
            async with PING_SEMAPHORE:
                is_alive = await ping_host(monitor.ip_address)

            # 状態を更新
            monitor.last_check = datetime.utcnow()
            monitor.is_alive = is_alive

            if is_alive:
                # 成功 - 失敗カウントをリセット、間隔を最小に
                if monitor.consecutive_failures > 0:
                    monitor.consecutive_failures = 0
                    monitor.next_check_interval = 60
                    await update_machine_status(db_pool, monitor)
            else:
                # 失敗 - エクスポネンシャルバックオフ
                monitor.consecutive_failures += 1
                monitor.next_check_interval = calculate_backoff(
                    monitor.consecutive_failures
                )
                await update_machine_status(db_pool, monitor)

            # 次のチェックまで待機
            await asyncio.sleep(monitor.next_check_interval)

        except asyncio.CancelledError:
            # グレースフルシャットダウン
            print(f"Monitor for {monitor.ip_address} cancelled")
            break
        except Exception as e:
            # その他のエラー - ログして続行
            print(f"Error monitoring {monitor.ip_address}: {e}")
            await asyncio.sleep(60)  # エラー時は基本間隔で再試行

def calculate_backoff(failure_count: int) -> int:
    """
    エクスポネンシャルバックオフの計算

    60s → 120s → 240s → 480s → ... → max 3600s
    """
    interval = 60 * (2 ** (failure_count - 1))
    return min(interval, 3600)
```

### タスク管理パターン

```python
class MachineMonitorManager:
    """すべてのマシン監視タスクを管理"""

    def __init__(self, db_pool):
        self.db_pool = db_pool
        self.monitors: Dict[int, asyncio.Task] = {}  # machine_id -> Task
        self.monitor_states: Dict[int, MachineMonitor] = {}

    async def start_monitoring(self, machine_id: int, ip_address: str):
        """マシンの監視を開始"""
        if machine_id in self.monitors:
            print(f"Already monitoring machine {machine_id}")
            return

        # 監視状態を作成
        monitor_state = MachineMonitor(
            machine_id=machine_id,
            ip_address=ip_address
        )
        self.monitor_states[machine_id] = monitor_state

        # 長期実行タスクを作成
        task = asyncio.create_task(
            monitor_machine(monitor_state, self.db_pool)
        )
        self.monitors[machine_id] = task

        print(f"Started monitoring {ip_address} (machine {machine_id})")

    async def stop_monitoring(self, machine_id: int):
        """マシンの監視を停止"""
        if machine_id not in self.monitors:
            return

        # タスクをキャンセル
        task = self.monitors[machine_id]
        task.cancel()

        try:
            await task  # クリーンアップを待機
        except asyncio.CancelledError:
            pass

        # クリーンアップ
        del self.monitors[machine_id]
        del self.monitor_states[machine_id]

        print(f"Stopped monitoring machine {machine_id}")

    async def shutdown(self):
        """すべての監視タスクをグレースフルにシャットダウン"""
        print(f"Shutting down {len(self.monitors)} monitor tasks...")

        # すべてのタスクをキャンセル
        for task in self.monitors.values():
            task.cancel()

        # すべてのタスクの完了を待機
        if self.monitors:
            await asyncio.gather(
                *self.monitors.values(),
                return_exceptions=True
            )

        self.monitors.clear()
        self.monitor_states.clear()
        print("All monitors shut down")

    def get_status(self, machine_id: int) -> MachineMonitor:
        """マシンの現在の監視状態を取得"""
        return self.monitor_states.get(machine_id)

    def get_all_statuses(self) -> Dict[int, MachineMonitor]:
        """すべてのマシンの監視状態を取得"""
        return self.monitor_states.copy()
```

### 代替案の評価

#### A. asyncio.gather()ですべてのタスクを一度に実行

**欠点**:
- 動的なマシンの追加/削除が困難
- きめ細かいライフサイクル管理がない
- 長期実行サービスには不適切

**判定**: 却下 - 静的なタスクセットにのみ適している

#### B. asyncio.TaskGroup（Python 3.11+）

**欠点**:
- 1つのタスクが例外を発生させるとすべてのタスクがキャンセルされる
- 長期実行の監視には設計されていない
- コンテキストマネージャーを抜けるとすべてのタスクが停止

**判定**: 却下 - この使用ケースには不適切。短期タスクグループ向け。

#### C. PersistentTaskGroup（aiotools）

**利点**:
- 未処理の例外があっても実行を継続
- 長期実行タスク向け設計

**欠点**:
- 追加の依存関係
- 私たちの手動アプローチと比較して柔軟性が低い

**判定**: 検討可能だが、手動管理の方が制御性が高い

---

## 3. エクスポネンシャルバックオフ実装

### 決定: カスタム実装（ライブラリベースではない）

### 根拠

既存のバックオフライブラリ（`backoff`、`tenacity`など）は再試行パターン向けに設計されていますが、私たちのユースケースは異なります：
- 失敗後に再試行するのではなく、継続的なモニタリング
- データベースに保存された状態ベースのバックオフ
- 各マシンの独立したバックオフスケジュール

### 実装

```python
def calculate_backoff(failure_count: int) -> int:
    """
    失敗カウントに基づいてエクスポネンシャルバックオフを計算

    スケジュール:
    - 0 failures: 60s
    - 1 failure:  60s (2^0 * 60)
    - 2 failures: 120s (2^1 * 60)
    - 3 failures: 240s (2^2 * 60)
    - 4 failures: 480s (2^3 * 60)
    - 5 failures: 960s (2^4 * 60)
    - 6+ failures: 3600s (max)

    Args:
        failure_count: 連続失敗回数

    Returns:
        次のチェックまでの秒数
    """
    if failure_count == 0:
        return 60

    interval = 60 * (2 ** (failure_count - 1))
    return min(interval, 3600)

# PostgreSQLとの統合
async def update_machine_status(db_pool, monitor: MachineMonitor):
    """マシンの状態をデータベースに更新"""
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE machines
            SET
                is_alive = $1,
                consecutive_failures = $2,
                next_check_interval = $3,
                last_check = $4,
                updated_at = NOW()
            WHERE id = $5
            """,
            monitor.is_alive,
            monitor.consecutive_failures,
            monitor.next_check_interval,
            monitor.last_check,
            monitor.machine_id
        )
```

### 正確なタイミングの確保

```python
async def monitor_machine_with_precise_timing(monitor: MachineMonitor, db_pool):
    """より正確なタイミングでの監視実装"""
    while True:
        try:
            start_time = asyncio.get_event_loop().time()

            # Pingを実行
            async with PING_SEMAPHORE:
                is_alive = await ping_host(monitor.ip_address)

            # 状態を更新
            elapsed = asyncio.get_event_loop().time() - start_time
            monitor.last_check = datetime.utcnow()
            monitor.is_alive = is_alive

            # バックオフロジック
            if is_alive:
                monitor.consecutive_failures = 0
                monitor.next_check_interval = 60
            else:
                monitor.consecutive_failures += 1
                monitor.next_check_interval = calculate_backoff(
                    monitor.consecutive_failures
                )

            await update_machine_status(db_pool, monitor)

            # ping実行時間を考慮して待機時間を調整
            sleep_time = max(0, monitor.next_check_interval - elapsed)
            await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error: {e}")
            await asyncio.sleep(60)
```

### ジッターの追加（オプション）

サンダリングハード問題（複数のマシンが同時にリカバリして同時にpingを送信）を避けるため：

```python
import random

def calculate_backoff_with_jitter(failure_count: int) -> int:
    """ジッター付きエクスポネンシャルバックオフ"""
    base_interval = calculate_backoff(failure_count)

    # ±10%のランダムジッターを追加
    jitter = random.uniform(-0.1, 0.1) * base_interval
    return int(base_interval + jitter)
```

### 代替案

#### A. backoffライブラリ

```python
@backoff.on_exception(backoff.expo, Exception, max_time=3600)
async def ping_with_backoff(address):
    return await async_ping(address)
```

**欠点**:
- 継続的モニタリングではなく再試行パターン向け
- 状態をデータベースに保存しない
- マシンごとに独立したスケジュールがない

#### B. tenacityライブラリ

同様の欠点。再試行ロジックには優れているが、継続的モニタリングには不向き。

---

## 4. リソース管理

### メモリフットプリント

**測定結果**:
- 1000タスク ≈ 1MB（完全に許容範囲）
- コルーチンオブジェクト ≈ 0.55KB each
- タスクオブジェクト ≈ 1KB each

**結論**: メモリは問題にならない。1000台の監視は軽量。

### グレースフルシャットダウン

```python
import signal

class MonitoringService:
    """メインのモニタリングサービス"""

    def __init__(self):
        self.db_pool = None
        self.manager = None
        self.shutdown_event = asyncio.Event()

    async def setup(self):
        """サービスを初期化"""
        import asyncpg

        # データベース接続プールを作成
        self.db_pool = await asyncpg.create_pool(
            host='localhost',
            database='vxlan_manager',
            user='user',
            password='password',
            min_size=10,
            max_size=50
        )

        self.manager = MachineMonitorManager(self.db_pool)

        # データベースからマシンをロード
        await self.load_machines()

    async def load_machines(self):
        """データベースから監視対象マシンをロード"""
        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, ip_address FROM machines WHERE enabled = true"
            )

            for row in rows:
                await self.manager.start_monitoring(
                    row['id'],
                    row['ip_address']
                )

    async def run(self):
        """メインサービスループ"""
        # シグナルハンドラを設定
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(
                sig,
                lambda: asyncio.create_task(self.shutdown())
            )

        print("Monitoring service started")

        # シャットダウンイベントを待機
        await self.shutdown_event.wait()

        print("Monitoring service stopped")

    async def shutdown(self):
        """グレースフルシャットダウンを実行"""
        print("Shutdown signal received")

        # すべての監視タスクを停止
        if self.manager:
            await self.manager.shutdown()

        # データベース接続を閉じる
        if self.db_pool:
            await self.db_pool.close()

        # メインループを終了
        self.shutdown_event.set()

# 使用例
async def main():
    service = MonitoringService()

    try:
        await service.setup()
        await service.run()
    except Exception as e:
        print(f"Fatal error: {e}")
        await service.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
```

### エラーハンドリングとタスク例外管理

```python
import traceback
from typing import Optional

async def monitor_machine_with_error_handling(
    monitor: MachineMonitor,
    db_pool,
    error_callback: Optional[callable] = None
):
    """堅牢なエラーハンドリングを持つ監視タスク"""
    consecutive_errors = 0
    max_consecutive_errors = 5

    while True:
        try:
            # Ping操作
            async with PING_SEMAPHORE:
                is_alive = await asyncio.wait_for(
                    ping_host(monitor.ip_address),
                    timeout=10.0  # 全体タイムアウト
                )

            # エラーカウンタをリセット
            consecutive_errors = 0

            # 状態を更新
            monitor.last_check = datetime.utcnow()
            monitor.is_alive = is_alive

            if is_alive:
                monitor.consecutive_failures = 0
                monitor.next_check_interval = 60
            else:
                monitor.consecutive_failures += 1
                monitor.next_check_interval = calculate_backoff(
                    monitor.consecutive_failures
                )

            await update_machine_status(db_pool, monitor)
            await asyncio.sleep(monitor.next_check_interval)

        except asyncio.CancelledError:
            # クリーンシャットダウン
            print(f"Monitor for {monitor.ip_address} cancelled cleanly")
            break

        except asyncio.TimeoutError:
            # タイムアウトはダウンとして扱う
            print(f"Timeout pinging {monitor.ip_address}")
            consecutive_errors += 1

            monitor.is_alive = False
            monitor.consecutive_failures += 1
            monitor.next_check_interval = calculate_backoff(
                monitor.consecutive_failures
            )

            try:
                await update_machine_status(db_pool, monitor)
            except Exception as db_error:
                print(f"Database error: {db_error}")

            await asyncio.sleep(monitor.next_check_interval)

        except Exception as e:
            # 予期しないエラー
            consecutive_errors += 1
            print(f"Error monitoring {monitor.ip_address}: {e}")
            traceback.print_exc()

            # エラーコールバックを呼び出す
            if error_callback:
                try:
                    await error_callback(monitor, e)
                except Exception:
                    pass

            # 連続エラーが多すぎる場合
            if consecutive_errors >= max_consecutive_errors:
                print(
                    f"Too many consecutive errors for {monitor.ip_address}, "
                    f"backing off for 5 minutes"
                )
                await asyncio.sleep(300)
                consecutive_errors = 0
            else:
                await asyncio.sleep(60)
```

### データベース接続プール管理

```python
async def create_db_pool():
    """最適化されたデータベース接続プールを作成"""
    import asyncpg

    return await asyncpg.create_pool(
        host='localhost',
        database='vxlan_manager',
        user='user',
        password='password',
        # プール設定
        min_size=10,           # 最小接続数
        max_size=50,           # 最大接続数
        max_inactive_connection_lifetime=300,  # 5分
        command_timeout=60,    # コマンドタイムアウト
        # パフォーマンス設定
        statement_cache_size=0,  # ステートメントキャッシュを無効化
    )

async def update_machine_status_with_retry(
    db_pool,
    monitor: MachineMonitor,
    max_retries: int = 3
):
    """リトライ機能付きデータベース更新"""
    for attempt in range(max_retries):
        try:
            async with db_pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE machines
                    SET
                        is_alive = $1,
                        consecutive_failures = $2,
                        next_check_interval = $3,
                        last_check = $4,
                        updated_at = NOW()
                    WHERE id = $5
                    """,
                    monitor.is_alive,
                    monitor.consecutive_failures,
                    monitor.next_check_interval,
                    monitor.last_check,
                    monitor.machine_id
                )
            return  # 成功

        except Exception as e:
            if attempt == max_retries - 1:
                raise
            print(f"DB update failed (attempt {attempt + 1}): {e}")
            await asyncio.sleep(1 * (2 ** attempt))  # エクスポネンシャルバックオフ
```

---

## 5. 完全な統合例

```python
import asyncio
import signal
from datetime import datetime
from typing import Dict, Optional
from dataclasses import dataclass
from icmplib import async_ping
import asyncpg

# グローバル設定
PING_SEMAPHORE = asyncio.Semaphore(100)
MAX_BACKOFF_SECONDS = 3600

@dataclass
class MachineMonitor:
    machine_id: int
    ip_address: str
    consecutive_failures: int = 0
    next_check_interval: int = 60
    last_check: Optional[datetime] = None
    is_alive: Optional[bool] = None

def calculate_backoff(failure_count: int) -> int:
    """60s → 120s → 240s → ... → max 3600s"""
    if failure_count == 0:
        return 60
    interval = 60 * (2 ** (failure_count - 1))
    return min(interval, MAX_BACKOFF_SECONDS)

async def ping_host(address: str) -> bool:
    """ICMP pingを実行"""
    try:
        host = await async_ping(address, count=1, timeout=2, privileged=True)
        return host.is_alive
    except Exception as e:
        print(f"Ping error for {address}: {e}")
        return False

async def update_machine_status(db_pool, monitor: MachineMonitor):
    """データベース状態を更新"""
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE machines
            SET
                is_alive = $1,
                consecutive_failures = $2,
                next_check_interval = $3,
                last_check = $4,
                updated_at = NOW()
            WHERE id = $5
            """,
            monitor.is_alive,
            monitor.consecutive_failures,
            monitor.next_check_interval,
            monitor.last_check,
            monitor.machine_id
        )

async def monitor_machine(monitor: MachineMonitor, db_pool):
    """単一マシンの監視ループ"""
    while True:
        try:
            # セマフォで並列度を制限
            async with PING_SEMAPHORE:
                is_alive = await ping_host(monitor.ip_address)

            # 状態を更新
            monitor.last_check = datetime.utcnow()
            monitor.is_alive = is_alive

            if is_alive:
                monitor.consecutive_failures = 0
                monitor.next_check_interval = 60
            else:
                monitor.consecutive_failures += 1
                monitor.next_check_interval = calculate_backoff(
                    monitor.consecutive_failures
                )

            await update_machine_status(db_pool, monitor)
            await asyncio.sleep(monitor.next_check_interval)

        except asyncio.CancelledError:
            print(f"Monitor for {monitor.ip_address} cancelled")
            break
        except Exception as e:
            print(f"Error monitoring {monitor.ip_address}: {e}")
            await asyncio.sleep(60)

class MachineMonitorManager:
    """マシン監視タスクマネージャー"""

    def __init__(self, db_pool):
        self.db_pool = db_pool
        self.monitors: Dict[int, asyncio.Task] = {}
        self.monitor_states: Dict[int, MachineMonitor] = {}

    async def start_monitoring(self, machine_id: int, ip_address: str):
        """マシンの監視を開始"""
        if machine_id in self.monitors:
            return

        monitor_state = MachineMonitor(
            machine_id=machine_id,
            ip_address=ip_address
        )
        self.monitor_states[machine_id] = monitor_state

        task = asyncio.create_task(
            monitor_machine(monitor_state, self.db_pool)
        )
        self.monitors[machine_id] = task
        print(f"Started monitoring {ip_address}")

    async def stop_monitoring(self, machine_id: int):
        """マシンの監視を停止"""
        if machine_id not in self.monitors:
            return

        task = self.monitors[machine_id]
        task.cancel()

        try:
            await task
        except asyncio.CancelledError:
            pass

        del self.monitors[machine_id]
        del self.monitor_states[machine_id]

    async def shutdown(self):
        """すべての監視タスクをシャットダウン"""
        print(f"Shutting down {len(self.monitors)} monitors...")

        for task in self.monitors.values():
            task.cancel()

        if self.monitors:
            await asyncio.gather(
                *self.monitors.values(),
                return_exceptions=True
            )

        self.monitors.clear()
        self.monitor_states.clear()

class MonitoringService:
    """メインモニタリングサービス"""

    def __init__(self):
        self.db_pool = None
        self.manager = None
        self.shutdown_event = asyncio.Event()

    async def setup(self):
        """サービスを初期化"""
        self.db_pool = await asyncpg.create_pool(
            host='localhost',
            database='vxlan_manager',
            user='user',
            password='password',
            min_size=10,
            max_size=50
        )

        self.manager = MachineMonitorManager(self.db_pool)
        await self.load_machines()

    async def load_machines(self):
        """データベースからマシンをロード"""
        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, ip_address FROM machines WHERE enabled = true"
            )

            for row in rows:
                await self.manager.start_monitoring(
                    row['id'],
                    row['ip_address']
                )

    async def run(self):
        """メインサービスループ"""
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(
                sig,
                lambda: asyncio.create_task(self.shutdown())
            )

        print("Monitoring service started")
        await self.shutdown_event.wait()
        print("Monitoring service stopped")

    async def shutdown(self):
        """グレースフルシャットダウン"""
        print("Shutdown signal received")

        if self.manager:
            await self.manager.shutdown()

        if self.db_pool:
            await self.db_pool.close()

        self.shutdown_event.set()

async def main():
    service = MonitoringService()

    try:
        await service.setup()
        await service.run()
    except Exception as e:
        print(f"Fatal error: {e}")
        await service.shutdown()

if __name__ == "__main__":
    # 注意: rootまたはCAP_NET_RAWで実行する必要があります
    asyncio.run(main())
```

---

## 6. パフォーマンス最適化のヒント

### 1. ICMPパケット設定の調整

```python
# より高速なping（精度は低い）
host = await async_ping(
    address,
    count=1,           # 単一パケット
    timeout=1,         # より短いタイムアウト
    interval=0.1,      # パケット間隔（複数の場合）
    payload_size=32    # より小さいペイロード
)
```

### 2. セマフォ制限の調整

```python
# システム能力に基づいて調整
# - ファイルディスクリプタ制限を確認: ulimit -n
# - ネットワーク帯域幅を考慮
# - CPU使用率を監視

# 保守的: 50
PING_SEMAPHORE = asyncio.Semaphore(50)

# 積極的: 200（十分なリソースがある場合）
PING_SEMAPHORE = asyncio.Semaphore(200)
```

### 3. データベースバッチ更新

```python
# 頻繁な個別更新の代わりに
async def batch_update_status(db_pool, monitors: list[MachineMonitor]):
    """複数のマシンを一度に更新"""
    async with db_pool.acquire() as conn:
        await conn.executemany(
            """
            UPDATE machines
            SET is_alive = $1, consecutive_failures = $2,
                next_check_interval = $3, last_check = $4
            WHERE id = $5
            """,
            [
                (m.is_alive, m.consecutive_failures,
                 m.next_check_interval, m.last_check, m.machine_id)
                for m in monitors
            ]
        )
```

### 4. メトリクスとモニタリング

```python
from collections import defaultdict
import time

class MetricsCollector:
    """パフォーマンスメトリクスを収集"""

    def __init__(self):
        self.ping_count = 0
        self.ping_success = 0
        self.ping_failure = 0
        self.ping_durations = []
        self.start_time = time.time()

    def record_ping(self, success: bool, duration: float):
        self.ping_count += 1
        if success:
            self.ping_success += 1
        else:
            self.ping_failure += 1
        self.ping_durations.append(duration)

    def get_stats(self):
        uptime = time.time() - self.start_time
        avg_duration = (
            sum(self.ping_durations) / len(self.ping_durations)
            if self.ping_durations else 0
        )

        return {
            'uptime_seconds': uptime,
            'total_pings': self.ping_count,
            'successful_pings': self.ping_success,
            'failed_pings': self.ping_failure,
            'success_rate': self.ping_success / max(self.ping_count, 1),
            'avg_ping_duration': avg_duration,
            'pings_per_second': self.ping_count / max(uptime, 1)
        }

# グローバルメトリクスコレクター
metrics = MetricsCollector()
```

---

## 7. デプロイメントに関する考慮事項

### Systemdサービス

```ini
[Unit]
Description=VXLAN Manager Monitoring Service
After=network.target postgresql.service

[Service]
Type=simple
User=vxlan-monitor
Group=vxlan-monitor

# CAP_NET_RAWを付与（rootの代わり）
AmbientCapabilities=CAP_NET_RAW
CapabilityBoundingSet=CAP_NET_RAW

WorkingDirectory=/opt/vxlan-manager
ExecStart=/opt/vxlan-manager/venv/bin/python -m vxlan_manager.monitor

Restart=always
RestartSec=10

# リソース制限
LimitNOFILE=10000
MemoryLimit=512M

[Install]
WantedBy=multi-user.target
```

### Dockerデプロイメント

```dockerfile
FROM python:3.11-slim

# システムパッケージをインストール
RUN apt-get update && apt-get install -y \
    libcap2-bin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存関係をインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# CAP_NET_RAWを付与
RUN setcap cap_net_raw+ep /usr/local/bin/python3.11

USER nobody
CMD ["python", "-m", "vxlan_manager.monitor"]
```

### 環境変数設定

```bash
# .env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vxlan_manager
DB_USER=vxlan_user
DB_PASSWORD=secure_password

PING_CONCURRENCY=100
PING_TIMEOUT=2
MIN_CHECK_INTERVAL=60
MAX_CHECK_INTERVAL=3600

LOG_LEVEL=INFO
```

---

## 8. テスト戦略

### ユニットテスト

```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_calculate_backoff():
    assert calculate_backoff(0) == 60
    assert calculate_backoff(1) == 60
    assert calculate_backoff(2) == 120
    assert calculate_backoff(3) == 240
    assert calculate_backoff(10) == 3600  # max

@pytest.mark.asyncio
async def test_ping_host_success():
    with patch('icmplib.async_ping') as mock_ping:
        mock_host = AsyncMock()
        mock_host.is_alive = True
        mock_ping.return_value = mock_host

        result = await ping_host('192.168.1.1')
        assert result is True

@pytest.mark.asyncio
async def test_monitor_machine_lifecycle():
    db_pool = AsyncMock()
    monitor = MachineMonitor(
        machine_id=1,
        ip_address='192.168.1.1'
    )

    with patch('__main__.ping_host', return_value=True):
        # タスクを開始
        task = asyncio.create_task(
            monitor_machine(monitor, db_pool)
        )

        # 少し実行させる
        await asyncio.sleep(0.1)

        # キャンセル
        task.cancel()

        with pytest.raises(asyncio.CancelledError):
            await task
```

### 統合テスト

```python
@pytest.mark.asyncio
async def test_full_monitoring_lifecycle(test_db_pool):
    manager = MachineMonitorManager(test_db_pool)

    # 監視を開始
    await manager.start_monitoring(1, '127.0.0.1')
    assert 1 in manager.monitors

    # 少し実行
    await asyncio.sleep(2)

    # 状態を確認
    state = manager.get_status(1)
    assert state is not None
    assert state.last_check is not None

    # シャットダウン
    await manager.shutdown()
    assert len(manager.monitors) == 0
```

---

## 9. まとめと推奨事項

### 最終的な技術スタック

| コンポーネント | 推奨 | 理由 |
|----------|------|------|
| Pingライブラリ | `icmplib` | モダン、高パフォーマンス、asyncio最適化 |
| 並行制御 | `asyncio.Semaphore(100)` | シンプル、効果的、リソースを保護 |
| タスク管理 | 手動ライフサイクル管理 | 最大の柔軟性と制御 |
| バックオフ | カスタム実装 | ユースケースに特化、DB統合 |
| DB接続 | `asyncpg.Pool` | 高性能、asyncioネイティブ |

### 実装チェックリスト

- [ ] `icmplib`をインストールして権限を設定
- [ ] 100の並列度でセマフォベースの並行制御を実装
- [ ] 各マシンの長期実行監視タスクを作成
- [ ] エクスポネンシャルバックオフロジック（60s→3600s）を実装
- [ ] PostgreSQL統合（asyncpg）を追加
- [ ] グレースフルシャットダウンハンドラを実装
- [ ] 包括的なエラーハンドリングを追加
- [ ] メトリクスとロギングを設定
- [ ] ユニットテストと統合テストを作成
- [ ] SystemdサービスまたはDockerコンテナを設定
- [ ] CAP_NET_RAW権限を設定
- [ ] 本番環境でパフォーマンステストを実施

### パフォーマンス期待値

| メトリクス | 期待値 |
|--------|------|
| メモリ使用量 | ~1-2MB（1000タスク） |
| 並列ping数 | 100 |
| 単一ping時間 | <2秒 |
| スループット | ~50 pings/秒（安定状態） |
| CPU使用率 | <10%（アイドル時）、<50%（ピーク時） |

### 今後の改善案

1. **適応型バックオフ**: ネットワーク条件に基づいてバックオフを動的に調整
2. **地理的分散**: 複数リージョンからのping（より良い到達性）
3. **代替ヘルスチェック**: ICMP + TCP/HTTPチェック
4. **機械学習**: パターン検出とアノマリー検出
5. **メトリクスエクスポート**: PrometheusまたはGrafana統合

---

## 参考文献

- [icmplib GitHub](https://github.com/ValentinBELYN/icmplib)
- [Python asyncio Documentation](https://docs.python.org/3/library/asyncio.html)
- [asyncpg Documentation](https://magicstack.github.io/asyncpg/)
- [Asyncio Semaphore Guide](https://rednafi.com/python/limit_concurrency_with_semaphore/)
- [Graceful Shutdowns with asyncio](https://www.roguelynn.com/words/asyncio-graceful-shutdowns/)
- [Memory Consumption of Async Tasks](https://pkolaczk.github.io/memory-consumption-of-async/)
