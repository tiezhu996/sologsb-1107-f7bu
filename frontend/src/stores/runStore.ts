import { create } from 'zustand'
import type { Mould } from '../types/mould'
import type { SheetRun, SheetRunInput } from '../types/sheet-run'
import { db, plain } from '../utils/db'
import { calculateDeviation } from '../utils/stripe'
import { groupRuns } from '../utils/revisions'

interface RunStore {
  sheetRuns: SheetRun[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadRuns: () => Promise<void>
  /** 登记新槽工序（基线版 v1），纸帘标准间距取当前纸帘快照 */
  addRun: (input: SheetRunInput, mould: Mould | undefined) => Promise<SheetRun | null>
  /** 复测更正：保留当前版本为历史，生成 v(n+1)，必填更正原因 */
  reviseRun: (versionId: number, measuredGap: number, reason: string, mould: Mould | undefined) => Promise<SheetRun | null>
  /** 作废指定版本（仍留档可查），必填作废原因 */
  voidRunVersion: (versionId: number, reason: string) => Promise<void>
}

export const useRunStore = create<RunStore>((set, get) => ({
  sheetRuns: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadRuns: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const sheetRuns = await db.sheetRuns.orderBy('runDate').reverse().toArray()
      set({ sheetRuns, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '抄纸工序读取失败，请检查浏览器存储权限' })
    }
  },
  addRun: async (input, mould) => {
    set({ error: null })
    try {
      const payload = plain(input)
      const standardGap = mould?.stripeGap ?? payload.measuredGap
      const record: SheetRun = {
        ...payload,
        versionNo: 1,
        prevId: null,
        reason: '基线版',
        voided: false,
        voidReason: '',
        voidedAt: null,
        revisedAt: payload.runDate ? `${payload.runDate}T09:00:00.000Z` : new Date().toISOString(),
        standardGap,
        deviation: calculateDeviation(payload.measuredGap, standardGap),
        schemaRev: 3,
      }
      const id = Number(await db.sheetRuns.add(record))
      const created: SheetRun = { ...record, id }
      set((state) => ({ sheetRuns: [created, ...state.sheetRuns], error: null }))
      return created
    } catch {
      set({ error: '工序登记失败，请检查工序编号是否重复' })
      return null
    }
  },
  reviseRun: async (versionId, measuredGap, reason, mould) => {
    set({ error: null })
    try {
      const state = get()
      const prev = state.sheetRuns.find((run) => run.id === versionId)
      if (!prev || prev.voided) {
        set({ error: '当前版本不可更正，请确认选择的是最新有效版' })
        return null
      }
      const trimmedReason = reason.trim()
      if (!trimmedReason) {
        set({ error: '请填写更正原因' })
        return null
      }
      const sameRun = state.sheetRuns.filter((run) => run.runNo === prev.runNo)
      const versionNo = sameRun.reduce((max, run) => Math.max(max, run.versionNo ?? 1), 0) + 1
      const standardGap = mould?.stripeGap ?? prev.standardGap ?? measuredGap
      const next: SheetRun = {
        ...plain(prev),
        id: undefined,
        versionNo,
        prevId: prev.id ?? null,
        reason: trimmedReason,
        voided: false,
        voidReason: '',
        voidedAt: null,
        revisedAt: new Date().toISOString(),
        measuredGap,
        standardGap,
        deviation: calculateDeviation(measuredGap, standardGap),
        schemaRev: 3,
      }
      const id = Number(await db.sheetRuns.add(next))
      const created: SheetRun = { ...next, id }
      set((state) => ({ sheetRuns: [created, ...state.sheetRuns], error: null }))
      return created
    } catch {
      set({ error: '复测更正保存失败，请稍后重试' })
      return null
    }
  },
  voidRunVersion: async (versionId, reason) => {
    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      set({ error: '请填写作废原因' })
      return
    }
    try {
      const now = new Date().toISOString()
      await db.sheetRuns.update(versionId, {
        voided: true,
        voidReason: trimmedReason,
        voidedAt: now,
        schemaRev: 3,
      })
      set((state) => ({
        sheetRuns: state.sheetRuns.map((run) =>
          run.id === versionId ? { ...run, voided: true, voidReason: trimmedReason, voidedAt: now } : run,
        ),
        error: null,
      }))
    } catch {
      set({ error: '作废失败，请稍后重试' })
    }
  },
}))

/** 按槽号分组的便捷选择器（页面直接用 groupRuns 即可）。 */
export function selectRunGroups(runs: SheetRun[]) {
  return groupRuns(runs)
}
