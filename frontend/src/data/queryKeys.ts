/**
 * TanStack Query のキー。
 *
 * 読むのは「家計のデータ一式（`snapshot`）」1つだけ。月ごとの数字は、その中身から
 * `domain/` の純粋関数で出す（サーバーに月ごとの問い合わせをしない）。
 * 楽観更新は使わず、書いたあとに必要な範囲を invalidate する（CLAUDE.md §3）。
 */
export const queryKeys = {
  /** ログイン中の人（セッション） */
  session: () => ['session'] as const,
  /** 家計のデータ一式・「今日」・ログイン中の人 */
  snapshot: () => ['snapshot'] as const,
} as const
