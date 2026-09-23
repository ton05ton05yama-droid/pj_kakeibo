#!/usr/bin/env bash
# supabase/migrations/ を Supabase の Postgres イメージに流し、仕様書 §9 の見本データで
# §9.6 の金額・§2.2 の権限・RPC の戻り値を確かめる（04 §11「検証を1コマンドにする」）。
#
#   bash supabase/tests/run.sh          # 流して結果だけ出す
#   KEEP=1 bash supabase/tests/run.sh   # 終わってもコンテナを残す（中を見る）
#
# 要るもの: Docker。ネットワーク（初回だけイメージを取る）。
set -euo pipefail

IMAGE=public.ecr.aws/supabase/postgres:17.6.1.167
NAME=kakeibo-verify
DB=postgres   # このイメージは postgres データベースにだけ auth スキーマを持つ
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

psql_() { docker exec -i -e PGPASSWORD=postgres "$NAME" psql -v ON_ERROR_STOP=1 -q -U postgres -h localhost "$@"; }

cleanup() { [ "${KEEP:-}" = "1" ] || docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker rm -f "$NAME" >/dev/null 2>&1 || true
echo "== コンテナを起動 ($IMAGE)"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 90); do
  docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null

echo "== マイグレーションを流す"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "   $(basename "$f")"
  psql_ -d "$DB" < "$f"
done

echo "== 検証用の仕掛けと初期データ"
psql_ -d "$DB" < "$ROOT/supabase/tests/setup.sql"

echo "== 見本データとシナリオ"
docker exec "$NAME" mkdir -p /tests
docker cp "$ROOT/supabase/tests/sample_expenses.sql" "$NAME":/tests/ >/dev/null
set +e
psql_ -d "$DB" < "$ROOT/supabase/tests/scenario.sql" 2>&1 | grep -E '^(NOTICE|ERROR|###|psql)' | sed -e 's/^NOTICE:  //'
rc=${PIPESTATUS[0]}
set -e
echo
if [ "$rc" -eq 0 ]; then echo "== 全部とおりました"; else echo "== 失敗しました（上の NG / ERROR）"; exit 1; fi
