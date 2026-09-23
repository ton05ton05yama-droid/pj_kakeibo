/**
 * ドメイン（計算・型・月の状態）の入口。
 *
 * 正本: docs/03_ui_spec.md §1.1・§4.0.2・§6・§8・§9、docs/02_settlement.md、mock/index.html の CALC / MODEL。
 * UI からは必ずここを通して使う（DB の値を UI で直接計算しない。§6.2）。
 */

export * from './calc'
export * from './categories'
export * from './month'
export * from './operations'
export * from './sampleData'
export * from './types'
export * from './validate'
