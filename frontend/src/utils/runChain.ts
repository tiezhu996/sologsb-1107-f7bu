import type { PaperSample } from '../types/paper-sample'
import type { SheetRun } from '../types/sheet-run'

/** 同槽工序的修订链 */
export interface RunChain {
  /** 链 id，取基线版记录 id；缺字段的老记录退回自身 id */
  chainId: number
  runNo: string
  versions: SheetRun[]
  /** 链内当前代表版本：优先取最新版本，缺序号时按数组顺序兜底 */
  head: SheetRun
  activeVersions: SheetRun[]
  /** 同一槽存在两个及以上并列有效版 */
  hasConflict: boolean
  voided: boolean
}

/** 样本所引用工序的状态 */
export type SampleRunState = 'active' | 'superseded' | 'void' | 'conflict' | 'missing'

/** 取记录所属链 id：老数据缺 chainId 时按自身 id 作为基线链 */
export function chainIdOf(run: SheetRun): number {
  return run.chainId ?? run.id ?? 0
}

function byVersionAsc(a: SheetRun, b: SheetRun): number {
  const av = a.versionNo ?? 1
  const bv = b.versionNo ?? 1
  if (av !== bv) return av - bv
  return (a.id ?? 0) - (b.id ?? 0)
}

/** 把扁平的工序版本记录组装成按槽归集的修订链，并按代表版本日期倒序 */
export function buildRunChains(runs: SheetRun[]): RunChain[] {
  const groups = new Map<number, SheetRun[]>()
  for (const run of runs) {
    const key = chainIdOf(run)
    const list = groups.get(key)
    if (list) list.push(run)
    else groups.set(key, [run])
  }
  const chains: RunChain[] = []
  for (const [chainId, list] of groups) {
    const versions = list.sort(byVersionAsc)
    const head = versions[versions.length - 1]
    const activeVersions = versions.filter((run) => (run.status ?? 'active') === 'active')
    const voided = versions.every((run) => run.status === 'void')
    chains.push({
      chainId,
      runNo: head.runNo,
      versions,
      head,
      activeVersions,
      hasConflict: activeVersions.length >= 2,
      voided,
    })
  }
  return chains.sort((a, b) => {
    if (a.head.runDate !== b.head.runDate) return a.head.runDate < b.head.runDate ? 1 : -1
    return b.chainId - a.chainId
  })
}

/** 链上的最新有效版；全链作废或并列有效时返回 null */
export function latestActiveVersion(chain: RunChain): SheetRun | null {
  if (chain.voided || chain.hasConflict) return null
  return chain.activeVersions[0] ?? null
}

export function findRunChain(chains: RunChain[], run: SheetRun): RunChain | undefined {
  return chains.find((chain) => chain.chainId === chainIdOf(run))
}

/** 样本固定引用的版本 id（老记录缺 runVersionId 时退回 runId） */
export function referencedVersionId(sample: PaperSample): number {
  return sample.runVersionId ?? sample.runId
}

/** 判断样本引用版本在修订链中的状态 */
export function resolveSampleRunState(sample: PaperSample, chains: RunChain[]): SampleRunState {
  const versionId = referencedVersionId(sample)
  const chain = chains.find((item) => item.versions.some((version) => version.id === versionId))
  if (!chain) {
    // 引用记录直接缺失；仍可能是老数据尚未升级，按缺失处理
    return 'missing'
  }
  if (chain.hasConflict) return 'conflict'
  const referenced = chain.versions.find((version) => version.id === versionId)
  if (!referenced) return 'missing'
  return referenced.status ?? 'active'
}

/** 样本引用的版本记录 */
export function findReferencedRun(sample: PaperSample, chains: RunChain[]): SheetRun | null {
  const versionId = referencedVersionId(sample)
  for (const chain of chains) {
    const found = chain.versions.find((version) => version.id === versionId)
    if (found) return found
  }
  return null
}

/** 样本所引用工序是否已失效（作废、并列有效、记录缺失） */
export function isSampleStale(state: SampleRunState): boolean {
  return state === 'void' || state === 'conflict' || state === 'missing'
}

/** 工作台统计口径：只统计最新有效版所在链；作废链与并列有效链均不计入 */
export function statisticallyCountedRuns(chains: RunChain[]): SheetRun[] {
  const counted: SheetRun[] = []
  for (const chain of chains) {
    const latest = latestActiveVersion(chain)
    if (latest) counted.push(latest)
  }
  return counted
}

/** 取版本当时适用的标准帘纹间距：优先版本快照，缺字段的老记录退回当前纸帘值 */
export function standardGapOf(run: SheetRun, currentMouldGap?: number): number {
  if (typeof run.standardGap === 'number' && Number.isFinite(run.standardGap)) return run.standardGap
  return currentMouldGap ?? run.measuredGap
}
