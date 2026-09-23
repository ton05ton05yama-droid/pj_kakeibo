# features

画面と機能単位のフックを `features/<機能名>/` に置く（担当ごと）。

- `record/` … S-11（記録タブのトップ）・S-12
- `expenses/` … S-10・S-13・S-14・S-15
- `settle/` … S-20・S-21・S-22
- `settings/` … S-30〜S-34
- `auth/` … S-01・S-02・S-03

共通の部品は `src/components/`、計算は `src/domain/`、読み書きは `src/data/`。
画面ができたら `src/app/app.tsx` の `PlaceholderScreen` を差し替える。
