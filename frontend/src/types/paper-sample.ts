export const EVENNESS_LEVELS = ['均匀', '略花', '花'] as const
export type EvennessLevel = (typeof EVENNESS_LEVELS)[number]

export interface PaperSample {
  id?: number
  sampleNo: string
  /** 固定引用登记当时那版工序（版本记录 id），老数据该字段缺失时按 runId 处理 */
  runId: number
  runVersionId?: number
  sizeMm: number
  stripeCount: number
  evenness: EvennessLevel
  archiveBin: string
  schemaRev?: number
  /** 旧数据升级时补打的基线标记 */
  baseline?: boolean
}

export type PaperSampleInput = Omit<PaperSample, 'id' | 'schemaRev' | 'baseline'>
