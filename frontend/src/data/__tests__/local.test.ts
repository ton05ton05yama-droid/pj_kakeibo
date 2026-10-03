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

  it('毎月の支払いの行の払った人は相手も変えられる（§2.2）', async () => {
    const repository = createLocalRepository('sep-open')
    // s01 家賃（毎月の支払いの行。記録した人は 'auto'）をりさこが直す
    await repository.auth.signIn('risako', 'pw')
    const before = await repository.loadSnapshot()
    const row = before.data.expenses.find((e) => e.tpl !== null && e.month === '2026-09')
    expect(row).toBeDefined()
    if (!row) return
    const saved = await repository.updateExpense(row.id, { payer: 'b', amount: 12345 })
    expect(saved.payer).toBe('b')
    expect(saved.amount).toBe(12345)
  })

  it('毎月の支払いの行の日付・カテゴリ・メモは直せない（fixed_row_immutable）', async () => {
    const repository = createLocalRepository('sep-open')
    await repository.auth.signIn('risako', 'pw')
    const before = await repository.loadSnapshot()
    const row = before.data.expenses.find((e) => e.tpl !== null && e.month === '2026-09')
    expect(row).toBeDefined()
    if (!row) return
    await expect(repository.updateExpense(row.id, { date: '2026-09-02' })).rejects.toMatchObject({
      code: 'fixed_row_immutable',
    })
    await expect(repository.updateExpense(row.id, { cat: 'dining' })).rejects.toMatchObject({
      code: 'fixed_row_immutable',
    })
    await expect(repository.updateExpense(row.id, { memo: 'メモ' })).rejects.toMatchObject({
      code: 'fixed_row_immutable',
    })
  })

  it('記録の既定の払った人は本人の分だけ変わる（§12.1 Q3）', async () => {
    const { repository } = await signedIn('sep-open')
    await repository.updateDefaultPayer('joint')
    const after = await repository.loadSnapshot()
    expect(after.data.people.a.defaultPayer).toBe('joint')
    expect(after.data.people.b.defaultPayer).toBe('self')
  })

  it('給料の入り先は本人の分だけ変わる（S-33。2026-09-23 の決定）', async () => {
    const { repository } = await signedIn('sep-open')
    await repository.updateSalaryToJoint(true)
    const after = await repository.loadSnapshot()
    expect(after.data.people.a.salaryToJoint).toBe(true)
    expect(after.data.people.b.salaryToJoint).toBe(false)
  })

  it('出す割合は本人の分だけ変わる（相手の行に渡しても動かない。2026-09-23 の決定）', async () => {
    const { repository } = await signedIn('sep-open')
    // 相手（りさこ）の行: 呼び名と色は変えられるが、出す割合は変わらない
    await repository.updatePerson('b', { name: 'りさ', color: 'b', ratePct: 45 })
    const after = await repository.loadSnapshot()
    expect(after.data.people.b.name).toBe('りさ')
    expect(after.data.people.b.ratePct).toBe(40)
    // 自分（まさと）の行は変えられる
    await repository.updateContributionRate(45)
    const mine = await repository.loadSnapshot()
    expect(mine.data.people.a.ratePct).toBe(45)
  })

  it('出す額を決めると、そのときの給料の入り先を月ごとに保存する', async () => {
    const { repository } = await signedIn('sep-open')
    await repository.updateSalaryToJoint(true)
    const decided = await repository.decideContributions('2026-10', { a: 310000, b: 200000 })
    expect(decided.result).toBe('ok')
    const after = await repository.loadSnapshot()
    expect(after.data.contributions['2026-10']?.a?.salaryToJoint).toBe(true)
    expect(after.data.contributions['2026-10']?.b?.salaryToJoint).toBe(false)
    // あとで設定を戻しても、決めた月の値は動かない
    await repository.updateSalaryToJoint(false)
    const later = await repository.loadSnapshot()
    expect(later.data.contributions['2026-10']?.a?.salaryToJoint).toBe(true)
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

  it('決め直した月を元に戻すと、前の給料の入り先にも戻る（§12.1 Q27）', async () => {
    const { repository } = await signedIn('sep-open')
    // 2026-09 は §9.1 の見本データで決め済み（手取り 300,000・40%・自分の口座・出す額 120,000）
    const start = await repository.loadSnapshot()
    expect(start.data.contributions['2026-09']?.a).toMatchObject({
      net: 300000,
      ratePct: 40,
      salaryToJoint: false,
      amount: 120000,
    })
    const prev = start.data.contributions['2026-09']?.a

    // 給料の入り先を共用にしてから決め直すと、入り先だけいまの設定を取り込む（割合は保存値のまま）
    await repository.updateSalaryToJoint(true)
    const decided = await repository.decideContributions('2026-09', { a: 310000 })
    expect(decided.result).toBe('ok')
    if (decided.result !== 'ok') return
    const redecided = await repository.loadSnapshot()
    expect(redecided.data.contributions['2026-09']?.a).toMatchObject({
      net: 310000,
      ratePct: 40,
      salaryToJoint: true,
      amount: 124000,
    })

    // 元に戻すと、給料の入り先も前の値（自分の口座）に戻る
    const undone = await repository.undoDecideContributions('2026-09', decided.value.decidedAt)
    expect(undone.result).toBe('ok')
    const after = await repository.loadSnapshot()
    expect(after.data.contributions['2026-09']?.a?.salaryToJoint).toBe(false)
    expect(after.data.contributions['2026-09']?.a).toEqual(prev)
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

  it('2回目のやり直しを元に戻しても、1回目に済んだ分は戻らない（R2-D04）', async () => {
    const { repository } = await signedIn('sep-settled')
    // 1回目: 確定 → 2人チェック済み（sep-settled）→ やり直す（済んだ分が done に移る）
    const first = await repository.reopenMonth('2026-09')
    expect(first.result).toBe('ok')
    const moved = await repository.loadSnapshot()
    const afterFirst = moved.data.settlements['2026-09']
    expect(afterFirst?.done.a).toHaveLength(1)
    expect(afterFirst?.done.b).toHaveLength(1)
    // 中身は生きているオブジェクトなので、写しを取ってから先へ進む
    const transferredAfterFirst = { ...afterFirst?.transferred }

    // 2回目: この金額で精算（round が増える）→ 誰もチェックせずやり直す
    const confirmed = await repository.confirmMonth('2026-09', null)
    expect(confirmed.result).toBe('ok')
    const second = await repository.reopenMonth('2026-09')
    expect(second.result).toBe('ok')
    if (second.result !== 'ok') return

    // 元に戻す: 2回目には誰もチェックしていないので、1回目の済んだ分・チェックは動かない
    const undone = await repository.undoReopen('2026-09', second.value.round)
    expect(undone.result).toBe('ok')
    const after = await repository.loadSnapshot()
    const rec = after.data.settlements['2026-09']
    expect(rec?.transferred).toEqual(transferredAfterFirst)
    expect(rec?.done.a).toHaveLength(1)
    expect(rec?.done.b).toHaveLength(1)
    expect(rec?.checks).toEqual({})
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

  /* 毎月の支払いの開始月と変更の履歴（S-32・S-35。0010 と同じ決まり） ---------------- */

  const NEWS = { name: '新聞', cat: 'other', payer: 'joint', kind: 'fixed', amount: 3000 } as const

  it('読み込むと、見本データのひな形から「追加」の履歴を作る', async () => {
    const { snapshot } = await signedIn('sep-open')
    const changes = snapshot.data.templateChanges ?? []
    expect(changes).toHaveLength(snapshot.data.templates.length)
    expect(changes[0]).toMatchObject({
      templateId: 't1',
      change: 'add',
      from: '2026-08',
      before: null,
      after: { name: '家賃', cat: 'housing', payer: 'joint', kind: 'fixed', amount: 85000 },
      by: 'a',
      at: '2026-08-01T21:00',
    })
  })

  it('前の月から始めると、開始月から今月までの各月に行を作り、「追加」の履歴を残す', async () => {
    // sep-redo（10/3）: 9月はやり直し中（ロックされていない）、8月は精算済み
    const { repository } = await signedIn('sep-redo')
    await repository.addTemplate({ ...NEWS, from: '2026-09' })
    const after = await repository.loadSnapshot()
    const t = after.data.templates.find((x) => x.name === '新聞')
    expect(t?.from).toBe('2026-09')
    const rows = after.data.expenses.filter((e) => e.tpl === t?.id)
    expect(rows.map((e) => e.labelMonth).sort()).toEqual(['2026-09', '2026-10'])
    expect(after.data.templateChanges?.at(-1)).toMatchObject({
      templateId: t?.id,
      change: 'add',
      from: '2026-09',
      after: { name: '新聞', amount: 3000, payer: 'joint' },
      by: 'a',
    })
  })

  it('開始月から今月までにロック中の月があれば、追加しない（一番新しいロック中の月を返す）', async () => {
    // sep-transfer（10/1）: 8月は精算済み・9月は精算中
    const { repository } = await signedIn('sep-transfer')
    await expect(repository.addTemplate({ ...NEWS, from: '2026-08' })).rejects.toMatchObject({
      name: 'RepositoryError',
      code: 'month_locked',
      detail: '2026-09',
    })
    const after = await repository.loadSnapshot()
    expect(after.data.templates.some((x) => x.name === '新聞')).toBe(false)
  })

  it('開始月が家計を作った月より前・今月より後なら、今月から作る', async () => {
    const { repository } = await signedIn('sep-open')
    await repository.addTemplate({ ...NEWS, from: '2026-07' })
    await repository.addTemplate({ ...NEWS, name: '新聞2', from: '2026-12' })
    const after = await repository.loadSnapshot()
    expect(after.data.templates.find((x) => x.name === '新聞')?.from).toBe('2026-09')
    expect(after.data.templates.find((x) => x.name === '新聞2')?.from).toBe('2026-09')
  })

  it('直すと「直した」の履歴を、まだ作っていない最初の月から残し、元に戻すと消える', async () => {
    const { repository } = await signedIn('sep-open')
    const original = { name: '光回線', cat: 'telecom', payer: 'a', kind: 'fixed', amount: 5500 } as const
    const changeId = await repository.updateTemplate('t2', { ...original, name: 'Wi-Fi', amount: 4980 })
    const edited = await repository.loadSnapshot()
    expect(edited.data.templateChanges?.at(-1)).toMatchObject({
      id: changeId,
      templateId: 't2',
      change: 'update',
      from: '2026-10',
      before: { name: '光回線', amount: 5500, from: '2026-08' },
      after: { name: 'Wi-Fi', amount: 4980, from: '2026-08' },
      by: 'a',
    })
    // 既定の月（10月）から変えるので、もう作ってある9月の行はそのまま
    expect(edited.data.expenses.find((e) => e.tpl === 't2' && e.labelMonth === '2026-09')?.amount).toBe(5500)
    const count = edited.data.templateChanges?.length ?? 0
    if (changeId === null) throw new Error('履歴の ID が無い')
    expect(await repository.undoTemplateChange(changeId)).toMatchObject({ result: 'ok' })
    const undone = await repository.loadSnapshot()
    expect(undone.data.templates.find((t) => t.id === 't2')).toMatchObject(original)
    expect(undone.data.templateChanges).toHaveLength(count - 1)
    expect(undone.data.templateChanges?.some((c) => c.change === 'update')).toBe(false)
  })

  it('何も変わらない保存は履歴を残さない（月だけ後にしても同じ）', async () => {
    const { repository, snapshot } = await signedIn('sep-open')
    const count = snapshot.data.templateChanges?.length ?? 0
    const same = { name: '光回線', cat: 'telecom', payer: 'a', kind: 'fixed', amount: 5500 } as const
    expect(await repository.updateTemplate('t2', same)).toBeNull()
    expect(await repository.updateTemplate('t2', same, '2026-09')).toBeNull()
    expect((await repository.loadSnapshot()).data.templateChanges).toHaveLength(count)
  })

  /* 直すときの「何月分から」（S-32・0011 の update_template・undo_update_template） ------------ */

  const RENT = { name: '家賃', cat: 'housing', payer: 'joint', kind: 'fixed', amount: 85000 } as const

  it('前の月から直すと、その月以降の手つかずの行だけを書き換え、履歴の「◯月分から」はその月になる', async () => {
    // sep-open（9/22）: 9月はまだ精算していない。8月は精算済み
    const { repository, snapshot } = await signedIn('sep-open')
    const rentSep = snapshot.data.expenses.find((e) => e.tpl === 't1' && e.labelMonth === '2026-09')
    const netSep = snapshot.data.expenses.find((e) => e.tpl === 't2' && e.labelMonth === '2026-09')
    if (!rentSep || !netSep) throw new Error('9月の行が無い')
    // 光回線の9月の行は S-14 で個別に直す（手つかずではなくなる）
    await repository.updateExpense(netSep.id, { amount: 5800 })

    await repository.updateTemplate('t1', { ...RENT, amount: 90000 }, '2026-09')
    await repository.updateTemplate(
      't2',
      { name: '光回線', cat: 'telecom', payer: 'a', kind: 'fixed', amount: 4980 },
      '2026-09'
    )
    const after = await repository.loadSnapshot()
    const row = (tpl: string, m: string) => after.data.expenses.find((e) => e.tpl === tpl && e.labelMonth === m)
    expect(row('t1', '2026-09')?.amount).toBe(90000)
    // 精算済みの8月の行・個別に直した行はそのまま
    expect(row('t1', '2026-08')?.amount).toBe(85000)
    expect(row('t2', '2026-09')?.amount).toBe(5800)
    // 書き換えた行は手つかずのまま（直した人を付けない）
    expect(row('t1', '2026-09')?.editedAt).toBeNull()
    expect(after.data.templateChanges?.filter((c) => c.change === 'update').map((c) => c.from)).toEqual([
      '2026-09',
      '2026-09',
    ])
  })

  it('選んだ月から今月までにロック中の月があれば、直さない（一番新しいロック中の月を返す）', async () => {
    const { repository, snapshot } = await signedIn('sep-open')
    const count = snapshot.data.templateChanges?.length ?? 0
    await expect(repository.updateTemplate('t1', { ...RENT, amount: 90000 }, '2026-08')).rejects.toMatchObject({
      name: 'RepositoryError',
      code: 'month_locked',
      detail: '2026-08',
    })
    const after = await repository.loadSnapshot()
    expect(after.data.templates.find((t) => t.id === 't1')?.amount).toBe(85000)
    expect(after.data.templateChanges).toHaveLength(count)
  })

  it('月が家計を作った月より前・既定の月より後なら、既定の月から変える', async () => {
    const { repository } = await signedIn('sep-open')
    await repository.updateTemplate('t1', { ...RENT, amount: 90000 }, '2026-12')
    await repository.updateTemplate('t1', { ...RENT, amount: 91000 }, '2026-07')
    const after = await repository.loadSnapshot()
    expect(after.data.templateChanges?.filter((c) => c.change === 'update').map((c) => c.from)).toEqual([
      '2026-10',
      '2026-10',
    ])
    expect(after.data.expenses.find((e) => e.tpl === 't1' && e.labelMonth === '2026-09')?.amount).toBe(85000)
  })

  it('開始月より前の月を選ぶと開始月を広げてその月の行を作り、元に戻すとその行も消える', async () => {
    // sep-redo（10/3）: 9月はやり直し中（ロックされていない）
    const { repository } = await signedIn('sep-redo')
    await repository.addTemplate({ ...NEWS, from: '2026-10' })
    const added = await repository.loadSnapshot()
    const t = added.data.templates.find((x) => x.name === '新聞')
    if (!t) throw new Error('足したひな形が無い')
    const count = added.data.templateChanges?.length ?? 0

    // 値は同じで月だけ前にしても保存する（開始月が広がる）
    const changeId = await repository.updateTemplate(t.id, NEWS, '2026-09')
    const after = await repository.loadSnapshot()
    expect(after.data.templates.find((x) => x.id === t.id)?.from).toBe('2026-09')
    const months = after.data.expenses.filter((e) => e.tpl === t.id).map((e) => e.labelMonth)
    expect(months.sort()).toEqual(['2026-09', '2026-10'])
    expect(after.data.templateChanges?.at(-1)).toMatchObject({
      id: changeId,
      change: 'update',
      from: '2026-09',
      before: { from: '2026-10' },
      after: { from: '2026-09' },
    })

    if (changeId === null) throw new Error('履歴の ID が無い')
    expect(await repository.undoTemplateChange(changeId)).toMatchObject({ result: 'ok' })
    const undone = await repository.loadSnapshot()
    expect(undone.data.templates.find((x) => x.id === t.id)?.from).toBe('2026-10')
    expect(undone.data.expenses.filter((e) => e.tpl === t.id).map((e) => e.labelMonth)).toEqual(['2026-10'])
    expect(undone.data.templateChanges).toHaveLength(count)
  })

  it('元に戻すと、書き換えた行も前の値に戻る', async () => {
    const { repository } = await signedIn('sep-open')
    const changeId = await repository.updateTemplate('t1', { ...RENT, name: '家賃と駐車場', amount: 97000 }, '2026-09')
    if (changeId === null) throw new Error('履歴の ID が無い')
    expect(await repository.undoTemplateChange(changeId)).toMatchObject({ result: 'ok' })
    const undone = await repository.loadSnapshot()
    expect(undone.data.expenses.find((e) => e.tpl === 't1' && e.labelMonth === '2026-09')).toMatchObject({
      memo: '家賃',
      amount: 85000,
    })
    expect(undone.data.templates.find((t) => t.id === 't1')).toMatchObject(RENT)
  })

  it('元に戻せるのは、変更をした人が1分以内で、それが一番新しい履歴のときだけ', async () => {
    const { repository } = await signedIn('sep-open')
    expect(await repository.undoTemplateChange('nothing')).toMatchObject({ result: 'blocked', reason: 'not_found' })

    const first = await repository.updateTemplate('t1', { ...RENT, amount: 90000 })
    const second = await repository.updateTemplate('t1', { ...RENT, amount: 91000 })
    if (first === null || second === null) throw new Error('履歴の ID が無い')
    // 一番新しい履歴ではない
    expect(await repository.undoTemplateChange(first)).toMatchObject({ result: 'blocked', reason: 'too_late' })

    // 2分前の変更
    const snapshot = await repository.loadSnapshot()
    const c = snapshot.data.templateChanges?.find((x) => x.id === second)
    if (!c) throw new Error('履歴が無い')
    c.at = '2026-09-22T12:28'
    expect(await repository.undoTemplateChange(second)).toMatchObject({ result: 'blocked', reason: 'too_late' })
    c.at = snapshot.now

    // 相手（りさこ）は戻せない
    await repository.auth.signIn('risako', 'pw')
    expect(await repository.undoTemplateChange(second)).toMatchObject({ result: 'blocked', reason: 'too_late' })
  })

  it('やめると「やめた」の履歴を残し、やめるを取り消すと消える', async () => {
    const { repository } = await signedIn('sep-open')
    await repository.stopTemplate('t1')
    const stopped = await repository.loadSnapshot()
    expect(stopped.data.templateChanges?.at(-1)).toMatchObject({
      templateId: 't1',
      change: 'stop',
      from: '2026-10',
      before: { name: '家賃' },
      after: null,
    })
    await repository.stopTemplate('t1', true)
    const back = await repository.loadSnapshot()
    expect(back.data.templateChanges?.some((c) => c.change === 'stop')).toBe(false)
  })

  it('追加を元に戻すと、複数の月の行と履歴も消える', async () => {
    const { repository } = await signedIn('sep-redo')
    await repository.addTemplate({ ...NEWS, from: '2026-09' })
    const added = await repository.loadSnapshot()
    const t = added.data.templates.find((x) => x.name === '新聞')
    if (!t) throw new Error('足したひな形が無い')
    expect(await repository.deleteTemplate(t.id)).toMatchObject({ result: 'ok' })
    const after = await repository.loadSnapshot()
    expect(after.data.expenses.some((e) => e.tpl === t.id)).toBe(false)
    expect(after.data.templateChanges?.some((c) => c.templateId === t.id)).toBe(false)
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

  it('保留の行を端末から消せる（DB には何も送らない）', async () => {
    const { repository } = await signedIn('sep-open')
    const input = { id: 'p3', date: '2026-09-22', cat: 'dining' as const, amount: 900, payer: 'a' as const, memo: '' }
    await repository.enqueueExpense(input)
    expect(await repository.pendingExpenses()).toHaveLength(1)
    await repository.dropPending('p3')
    expect(await repository.pendingExpenses()).toEqual([])
    // 送るものが残っていないので、つながっても DB は増えない
    await repository.flushPending()
    const after = await repository.loadSnapshot()
    expect(summarize(after.data.expenses, '2026-09').total).toBe(180670)
  })

  it('保留の行の日付を変えて保存し直せる（同じ id で置き換わる）', async () => {
    const { repository } = await signedIn('sep-open')
    await repository.enqueueExpense({
      id: 'p4',
      date: '2026-09-22',
      cat: 'dining',
      amount: 900,
      payer: 'a',
      memo: 'ランチ',
    })
    await repository.updatePending('p4', {
      id: 'p4',
      date: '2026-09-20',
      cat: 'dining',
      amount: 1200,
      payer: 'b',
      memo: 'ランチ',
    })
    const rows = await repository.pendingExpenses()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'p4', date: '2026-09-20', amount: 1200, payer: 'b', sync: 'pending' })
  })

  it('「送れませんでした」の行を直すと、もう一度送る対象に戻る', async () => {
    const { repository } = await signedIn('sep-transfer')
    // 9月は精算中なので送れない → 'failed'
    await repository.enqueueExpense({ id: 'p5', date: '2026-09-15', cat: 'dining', amount: 1000, payer: 'a', memo: '' })
    await repository.flushPending()
    expect((await repository.pendingExpenses())[0]?.sync).toBe('failed')
    // 精算中でない10月に移して保存し直すと送れる
    await repository.updatePending('p5', {
      id: 'p5',
      date: '2026-10-02',
      cat: 'dining',
      amount: 1000,
      payer: 'a',
      memo: '',
    })
    expect((await repository.pendingExpenses())[0]?.sync).toBe('pending')
    await repository.flushPending()
    expect(await repository.pendingExpenses()).toEqual([])
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
