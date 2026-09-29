import { create } from 'zustand'
import type { Mould } from '../types/mould'
import type { CorrectRunInput, SheetRun, SheetRunInput } from '../types/sheet-run'
import { db, plain } from '../utils/db'
import { buildRunChains, chainIdOf } from '../utils/runChain'
import { calculateDeviation } from '../utils/stripe'

interface RunStore {
  sheetRuns: SheetRun[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadRuns: () => Promise<void>
  addRun: (input: SheetRunInput, mould: Mould | undefined) => Promise<SheetRun | null>
  correctRun: (versionId: number, input: CorrectRunInput) => Promise<SheetRun | null>
  voidRun: (versionId: number, reason: string, voidedBy: string) => Promise<boolean>
  clearError: () => void
}

function nowIso(): string {
  return new Date().toISOString()
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
      const standardGap = mould?.stripeGap ?? input.measuredGap
      const base: SheetRun = {
        ...plain(input),
        deviation: calculateDeviation(input.measuredGap, standardGap),
        schemaRev: 3,
        versionNo: 1,
        status: 'active',
        revisionKind: 'baseline',
        standardGap: mould?.stripeGap,
        mouldNoSnapshot: mould?.mouldNo,
        wireDiameterSnapshot: mould?.wireDiameter,
        meshDensitySnapshot: mould?.meshDensity,
      }
      const id = Number(await db.sheetRuns.add(base))
      const chainId = id
      await db.sheetRuns.update(id, { chainId })
      const created: SheetRun = { ...base, id, chainId }
      set((state) => ({ sheetRuns: [created, ...state.sheetRuns] }))
      return created
    } catch {
      set({ error: '工序登记失败，请稍后重试' })
      return null
    }
  },
  correctRun: async (versionId, input) => {
    set({ error: null })
    const reason = input.reason.trim()
    if (!reason) {
      set({ error: '更正必须写明原因' })
      return null
    }
    try {
      const result = await db.transaction('rw', db.sheetRuns, async () => {
        const current = await db.sheetRuns.get(versionId)
        if (!current || current.id === undefined) throw new Error('not-found')
        if (current.status === 'void') throw new Error('voided')
        const allVersions = await db.sheetRuns.where('chainId').equals(chainIdOf(current)).toArray()
        const activeVersions = allVersions.filter((run) => (run.status ?? 'active') === 'active')
        if (activeVersions.length >= 2) throw new Error('conflict')
        // 只能在链上版本号最新的有效版上更正，防止在历史版上分叉
        const maxVersionNo = allVersions.reduce((max, run) => Math.max(max, run.versionNo ?? 1), 0)
        if ((current.versionNo ?? 1) < maxVersionNo) throw new Error('not-head')

        const timestamp = nowIso()
        const standardGap = typeof current.standardGap === 'number' ? current.standardGap : current.measuredGap - current.deviation
        const nextVersionNo = (current.versionNo ?? 1) + 1
        // 去掉上一版的身份与作废留痕，其余参数（含纸帘快照）原样继承
        const { id: _id, ...rest } = current
        void _id
        const next: SheetRun = {
          ...rest,
          measuredGap: input.measuredGap,
          deviation: calculateDeviation(input.measuredGap, standardGap),
          schemaRev: 3,
          versionNo: nextVersionNo,
          status: 'active',
          revisionKind: 'correction',
          revisionReason: reason,
          revisedBy: input.revisedBy.trim() || current.operator,
          revisedAt: timestamp,
          prevVersionId: current.id,
          voidReason: undefined,
          voidedBy: undefined,
          voidedAt: undefined,
        }
        const newId = Number(await db.sheetRuns.add(next))
        await db.sheetRuns.update(current.id, { status: 'superseded' })
        return { ...next, id: newId } satisfies SheetRun
      })

      set((state) => ({
        sheetRuns: [
          result,
          ...state.sheetRuns.map((run) => (run.id === versionId ? { ...run, status: 'superseded' as const } : run)),
        ],
      }))
      return result
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : 'unknown'
      if (code === 'not-found') set({ error: '待更正的工序版本不存在' })
      else if (code === 'voided') set({ error: '该工序版本已作废，不能再更正' })
      else if (code === 'not-head') set({ error: '只能在最新版本上更正，请刷新后重试' })
      else if (code === 'conflict') set({ error: '同一槽存在并列有效版，请先作废多余版本后再更正' })
      else set({ error: '工序更正失败，请稍后重试' })
      return null
    }
  },
  voidRun: async (versionId, reason, voidedBy) => {
    set({ error: null })
    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      set({ error: '作废必须写明原因' })
      return false
    }
    try {
      const timestamp = nowIso()
      const current = await db.sheetRuns.get(versionId)
      if (!current || current.id === undefined) {
        set({ error: '待作废的工序版本不存在' })
        return false
      }
      if (current.status === 'void') {
        set({ error: '该工序版本已经作废' })
        return false
      }
      await db.sheetRuns.update(current.id, {
        status: 'void',
        voidReason: trimmedReason,
        voidedBy: voidedBy.trim() || current.operator,
        voidedAt: timestamp,
        schemaRev: 3,
      })
      set((state) => ({
        sheetRuns: state.sheetRuns.map((run) => (
          run.id === versionId
            ? { ...run, status: 'void' as const, voidReason: trimmedReason, voidedBy: voidedBy.trim() || current.operator, voidedAt: timestamp }
            : run
        )),
      }))
      return true
    } catch {
      set({ error: '工序作废失败，请稍后重试' })
      return false
    }
  },
  clearError: () => set({ error: null }),
}))

/** 供页面按修订链归集的便捷选择器 */
export function useRunChains() {
  const runs = useRunStore((state) => state.sheetRuns)
  return buildRunChains(runs)
}
