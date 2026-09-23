/**
 * ローカル実装が、仕様書 §9.6 の金額と §9.8 の状態をそのまま返すことを確かめる。
 * （§6.2 の計算そのものは domain のテストが見る。ここはデータ層の入出力だけ）
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { ScenarioId } from '../../domain'
import { attention, s20State, settleModel, summarize } from '../../domain'
import { createLocalRepository } from '../local'
import { clearPending } from '../pending'
import type { Repository, Snapshot } from '../repository'

async function signedIn(scenario: ScenarioId = 'sep-open'): Promise<{
  repository: Repository
  snapshot: Snapshot
}> {
  const repository = createLocalRepository(scenario)
  await repository.auth.signIn('masato', 'pw')
  return { repository, snapshot: await repository.loadSnapshot() }
}

beforeEach(() => {
  // 端末に保留した記録は localStorage に残るので、テストごとに空にする
  clearPending()
})

describe('ローカル実装', () => {
  it('ID とパスワードでログインする（違えば止まる）', async () => {
    const repository = createLocalRepository()
    await expect(repository.auth.signIn('unknown', 'pw')).rejects.toThrow()
    expect((await repository.auth.signIn('risako', 'pw')).viewer).toBe('b')
  })

  it('sep-open（9/22）は §9.6 の見込みの値になる', async () => {
    const { snapshot } = await signedIn('sep-open')
    const sum = summarize(snapshot.data.expenses, '2026-09')
    expect(sum.total).toBe(180670)
    expect(sum.adv).toEqual({ a: 29160, b: 18470 })
    expect(sum.joint).toBe(133040)
    expect(sum.pending).toHaveLength(2)

    const model = settleModel(snapshot.data, '2026-09', snapshot.now)
    expect(model.settle).toEqual({ a: 90840, b: 69530 })
    expect(model.jointNet).toBe(27330)
    expect(s20State(snapshot.data, model, null)).toBe('estimate')
    // ［この月を精算する］を押すと、月の途中でも片付けのモードになる（§12.1 Q2）
    expect(s20State(snapshot.data, model, '2026-09')).toBe('prep')
    // 9月が終わるまで赤い点は出さない
    expect(attention(snapshot.data, 'a', snapshot.now)).toBeNull()
  })

  it('sep-ready（10/1）は §9.6 の確定値になる', async () => {
    const { snapshot } = await signedIn('sep-ready')
    const model = settleModel(snapshot.data, '2026-09', snapshot.now)
    expect(model.total).toBe(206130)
    expect(model.adv).toEqual({ a: 37510, b: 22070 })
    expect(model.settle).toEqual({ a: 82490, b: 65930 })
    expect(model.jointNet).toBe(1870)
    expect(s20State(snapshot.data, model, null)).toBe('ready')
  })

  it('sep-redo（10/3）はやり直し後の残りになる', async () => {
    const { snapshot } = await signedIn('sep-redo')
    const model = settleModel(snapshot.data, '2026-09', snapshot.now)
    expect(model.total).toBe(209430)
    expect(model.settle).toEqual({ a: 79190, b: 65930 })
    expect(model.remaining).toEqual({ a: -3300, b: 0 })
    expect(model.jointNet).toBe(-1430)
    expect(s20State(snapshot.data, model, null)).toBe('redo')
  })

  it('金額待ちが残っていれば精算できない（片付ければ精算できる）', async () => {
    const { repository, snapshot } = await signedIn('sep-prep')
    const blockedResult = await repository.confirmMonth('2026-09', null)
    expect(blockedResult).toMatchObject({ result: 'blocked', reason: 'pending' })

    // §9.8 sep-ready の操作: ガス代（9月分）に 6,200、電気代（9月分）は来月に回す
    const pending = snapshot.data.expenses.filter((e) => e.month === '2026-09' && e.amount === null)
    expect(pending.map((e) => e.id).sort()).toEqual(['s05', 's06'])
    await repository.fillAmount('s06', 6200)
    await repository.deferExpense('s05')
    const okResult = await repository.confirmMonth('2026-09', null)
    expect(okResult.result).toBe('ok')

    const after = await repository.loadSnapshot()
    const model = settleModel(after.data, '2026-09', after.now)
    expect(model.settle).toEqual({ a: 82490, b: 65930 })
    expect(s20State(after.data, model, null)).toBe('transfer')
  })

  it('チェックは付ける・外すを指定する（冪等。そろうと精算済み）', async () => {
    const { repository } = await signedIn('sep-transfer')
    await repository.setCheck('2026-09', 'a', true)
    await repository.setCheck('2026-09', 'a', true)
    const result = await repository.setCheck('2026-09', 'b', true)
    expect(result).toMatchObject({ result: 'ok', value: { status: 'settled' } })
  })

  it('精算中の月には記録を足せない', async () => {
    const { repository } = await signedIn('sep-transfer')
    await expect(
      repository.addExpense({
        id: 'x1',
        date: '2026-09-15',
        cat: 'dining',
        amount: 1000,
        payer: 'joint',
        memo: 'テスト',
      })
    ).rejects.toThrow()
  })

  it('相手の記録は直せない・消せない（仕様書 §2.2）', async () => {
    const repository = createLocalRepository('sep-open')
    await repository.auth.signIn('risako', 'pw')
    // s22 コンビニ（まさとが記録した）
    await expect(repository.updateExpense('s22', { amount: 1 })).rejects.toThrow()
    await expect(repository.deleteExpense('s22')).rejects.toThrow()
  })

  it('記録の既定の払った人は本人の分だけ変わる（§12.1 Q3）', async () => {
    const { repository } = await signedIn('sep-open')
    await repository.updateDefaultPayer('joint')
    const after = await repository.loadSnapshot()
    expect(after.data.people.a.defaultPayer).toBe('joint')
    expect(after.data.people.b.defaultPayer).toBe('self')
  })

  it('出す額を決めたのを元に戻せる（2回目は戻せない）', async () => {
    const { repository } = await signedIn('sep-open')
    const decided = await repository.decideContributions('2026-10', { a: 310000, b: 200000 })
    expect(decided.result).toBe('ok')
    if (decided.result !== 'ok') return
    const first = await repository.undoDecideContributions('2026-10', decided.value.decidedAt)
    expect(first.result).toBe('ok')
    const second = await repository.undoDecideContributions('2026-10', decided.value.decidedAt)
    expect(second).toMatchObject({ result: 'blocked', reason: 'changed' })
    const after = await repository.loadSnapshot()
    expect(after.data.contributions['2026-10'] ?? {}).toEqual({})
  })

  /* ［精算をやり直す］の元に戻す（02 §7・04 §8.2 settle_undo_reopen） -------- */

  it('やり直したあとに記録を足すと戻せない（changed）', async () => {
    const { repository } = await signedIn('sep-settled')
    const reopened = await repository.reopenMonth('2026-09')
    expect(reopened.result).toBe('ok')
    if (reopened.result !== 'ok') return
    // やり直したあとに 3,300 を足す（§9.5 sep-redo と同じ操作）
    await repository.addExpense({
      id: 'x-hanger',
      date: '2026-09-28',
      cat: 'household_goods',
      amount: 3300,
      payer: 'a',
      memo: 'ハンガー',
    })
    const result = await repository.undoReopen('2026-09', reopened.value.round)
    expect(result).toMatchObject({ result: 'blocked', reason: 'changed' })
    // 戻さなかったので、やり直したまま（進行中・締め待ち）
    const after = await repository.loadSnapshot()
    expect(after.data.settlements['2026-09']?.status).toBeNull()
  })

  it('そのまま戻すと §9.6 の確定値が戻る', async () => {
    const { repository } = await signedIn('sep-settled')
    const reopened = await repository.reopenMonth('2026-09')
    expect(reopened.result).toBe('ok')
    if (reopened.result !== 'ok') return
    const result = await repository.undoReopen('2026-09', reopened.value.round)
    expect(result).toMatchObject({ result: 'ok', value: { status: 'settled' } })

    const after = await repository.loadSnapshot()
    const rec = after.data.settlements['2026-09']
    expect(rec?.status).toBe('settled')
    // 確定したときの値（snapshot）も戻る
    expect(rec?.snapshot?.settle).toEqual({ a: 82490, b: 65930 })
    expect(rec?.snapshot?.total).toBe(206130)
    expect(rec?.undoSnapshot).toBeNull()
    // チェックも済んだ分から戻る
    expect(rec?.transferred).toEqual({ a: 0, b: 0 })
    expect(Object.keys(rec?.checks ?? {}).sort()).toEqual(['a', 'b'])
    const model = settleModel(after.data, '2026-09', after.now)
    expect(model.settle).toEqual({ a: 82490, b: 65930 })
    expect(s20State(after.data, model, null)).toBe('settled')
  })

  /* 毎月の支払いの追加を元に戻す（04 §8.2 delete_template） ------------------ */

  it('毎月の支払いは作った直後だけ消せる（1分を過ぎると消せない）', async () => {
    const { repository } = await signedIn('sep-open')
    await repository.addTemplate({ name: '新聞', cat: 'other', payer: 'joint', kind: 'fixed', amount: 3000 })
    const added = await repository.loadSnapshot()
    const first = added.data.templates.find((t) => t.name === '新聞')
    expect(first?.createdAt).toBe(added.now)
    if (!first) return
    // 作った直後（行も手つかず）なら消せる
    expect(await repository.deleteTemplate(first.id)).toMatchObject({ result: 'ok' })

    await repository.addTemplate({ name: '新聞', cat: 'other', payer: 'joint', kind: 'fixed', amount: 3000 })
    const again = await repository.loadSnapshot()
    const second = again.data.templates.find((t) => t.name === '新聞')
    expect(second).toBeDefined()
    if (!second) return
    // 2分前に作ったことにすると、もう消せない（やめる＝stopTemplate に回す）
    second.createdAt = '2026-09-22T12:28'
    expect(await repository.deleteTemplate(second.id)).toMatchObject({ result: 'blocked', reason: 'too_late' })
    const kept = await repository.loadSnapshot()
    expect(kept.data.templates.some((t) => t.id === second.id)).toBe(true)
  })

  /* オフラインの保留（§3.6。記録の追加だけ） -------------------------------- */

  it('保留した記録は合計に入らず、つながったら送られる', async () => {
    const { repository } = await signedIn('sep-open')
    await repository.enqueueExpense({
      id: 'p1',
      date: '2026-09-22',
      cat: 'groceries',
      amount: 1280,
      payer: 'a',
      memo: 'スーパー',
    })
    const before = await repository.loadSnapshot()
    const sumBefore = summarize(before.data.expenses, '2026-09')
    // 合計には入れず、「未送信 1件」として出す（§3.6）
    expect(sumBefore.total).toBe(180670)
    expect(sumBefore.unsent).toHaveLength(1)
    expect(sumBefore.unsent[0]).toMatchObject({ id: 'p1', sync: 'pending', by: 'a' })

    await repository.flushPending()
    expect(await repository.pendingExpenses()).toEqual([])
    const after = await repository.loadSnapshot()
    const sumAfter = summarize(after.data.expenses, '2026-09')
    expect(sumAfter.unsent).toHaveLength(0)
    expect(sumAfter.total).toBe(180670 + 1280)
  })

  it('その月が精算中になっていたら「送れませんでした」（§3.6 の4）', async () => {
    const { repository } = await signedIn('sep-transfer')
    await repository.enqueueExpense({
      id: 'p2',
      date: '2026-09-15',
      cat: 'dining',
      amount: 1000,
      payer: 'joint',
      memo: 'ランチ',
    })
    await repository.flushPending()
    const rows = await repository.pendingExpenses()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.sync).toBe('failed')
    // 精算中の月の合計は動かない（§9.6 の確定値のまま）
    const after = await repository.loadSnapshot()
    expect(summarize(after.data.expenses, '2026-09').total).toBe(206130)
  })
})
