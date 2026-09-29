import { create } from 'zustand'
import type { Mould, MouldInput, MouldStateValue } from '../types/mould'
import { db, plain } from '../utils/db'
import { calculateMeshDensity } from '../utils/stripe'

interface MouldStore {
  moulds: Mould[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadMoulds: () => Promise<void>
  addMould: (input: MouldInput) => Promise<Mould | null>
  /**
   * 纸帘修补/状态流转。
   * 修补只影响此后新建的工序版本（标准间距快照），不回改历史工序。
   */
  repairMould: (id: number, nextState: MouldStateValue, stripeGap: number) => Promise<void>
}

export const useMouldStore = create<MouldStore>((set, get) => ({
  moulds: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadMoulds: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const moulds = await db.moulds.orderBy('mouldNo').toArray()
      set({ moulds, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '纸帘台帐读取失败，请检查浏览器存储权限' })
    }
  },
  addMould: async (input) => {
    set({ error: null })
    try {
      const payload = plain(input)
      const id = Number(await db.moulds.add(payload))
      const created: Mould = { ...payload, id, schemaRev: 3 }
      set((state) => ({ moulds: [created, ...state.moulds], error: null }))
      return created
    } catch {
      set({ error: '纸帘登记失败，请检查编号是否重复' })
      return null
    }
  },
  repairMould: async (id, nextState, stripeGap) => {
    const mould = get().moulds.find((item) => item.id === id)
    if (!mould) return
    const nextDensity = calculateMeshDensity(mould.wireDiameter, stripeGap)
    try {
      await db.moulds.update(id, { state: nextState, stripeGap, meshDensity: nextDensity, schemaRev: 3 })
      set((state) => ({
        moulds: state.moulds.map((item) =>
          item.id === id ? { ...item, state: nextState, stripeGap, meshDensity: nextDensity, schemaRev: 3 } : item,
        ),
        error: null,
      }))
    } catch {
      set({ error: '纸帘修补登记失败' })
    }
  },
}))
