import type { SheetRun } from '../types/sheet-run'

/**
 * 工序版本链工具。
 * 同一槽（runNo）下可有多个版本记录：
 * - 基线版（v1）登记后，复测更正生成 v2、v3……，旧版保留、原因可查；
 * - 版本可作废（voided），作废后仍留档可查；
 * - 「最新有效版」= 未作废且没有其他未作废版本以它为前置的版本（链梢）；
 * - 同一槽出现两个（含）以上并列有效链梢时判定为冲突，页面指出该槽并停止计入统计。
 */

export interface RunGroup {
  runNo: string
  /** 按版本号升序排列的全部版本 */
  versions: SheetRun[]
  /** 最新有效版；全部作废或冲突时为 null */
  current: SheetRun | null
  /** 存在两个并列有效版 */
  conflicted: boolean
  /** 全部版本均已作废 */
  allVoided: boolean
  /** 作废版本数（用于页面提示） */
  voidedCount: number
}

export function versionSort(a: SheetRun, b: SheetRun): number {
  const av = typeof a.versionNo === 'number' && Number.isFinite(a.versionNo) ? a.versionNo : 1
  const bv = typeof b.versionNo === 'number' && Number.isFinite(b.versionNo) ? b.versionNo : 1
  if (av !== bv) return av - bv
  return (a.id ?? 0) - (b.id ?? 0)
}

/** 将版本记录按槽号分组，并计算最新有效版与冲突状态。 */
export function groupRuns(runs: SheetRun[]): RunGroup[] {
  const map = new Map<string, SheetRun[]>()
  for (const run of runs) {
    const key = run.runNo
    const list = map.get(key)
    if (list) {
      list.push(run)
    } else {
      map.set(key, [run])
    }
  }

  const groups: RunGroup[] = []
  for (const [runNo, versions] of map) {
    versions.sort(versionSort)
    const valid = versions.filter((version) => version.voided !== true)
    const supersededIds = new Set(
      valid
        .map((version) => version.prevId)
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
    )
    const tips = valid.filter((version) => version.id === undefined || !supersededIds.has(version.id))
    const conflicted = tips.length > 1
    const allVoided = valid.length === 0
    const current = conflicted || allVoided ? null : (tips[0] ?? null)
    groups.push({ runNo, versions, current, conflicted, allVoided, voidedCount: versions.length - valid.length })
  }
  return groups
}

/** 取指定槽号的最新有效版。 */
export function currentVersionOf(runs: SheetRun[], runNo: string): SheetRun | null {
  return groupRuns(runs).find((group) => group.runNo === runNo)?.current ?? null
}

/** 按版本记录 id 建立索引。 */
export function versionById(runs: SheetRun[]): Map<number, SheetRun> {
  const map = new Map<number, SheetRun>()
  for (const run of runs) {
    if (run.id !== undefined) map.set(run.id, run)
  }
  return map
}

/** 版本展示标签，如 v2 · 复测更正。 */
export function versionLabel(version: SheetRun | null | undefined): string {
  if (!version) return '版本待补'
  const no = typeof version.versionNo === 'number' ? version.versionNo : 1
  return `v${no}${version.reason ? ` · ${version.reason}` : ''}`
}
