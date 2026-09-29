export const EVENNESS_LEVELS = ['均匀', '略花', '花'] as const
export type EvennessLevel = (typeof EVENNESS_LEVELS)[number]

export interface PaperSample {
  id?: number
  sampleNo: string
  /** 固定引用的工序版本记录 id（不随工序更正漂移） */
  runVersionId: number | null
  sizeMm: number
  stripeCount: number
  evenness: EvennessLevel
  archiveBin: string
  schemaRev?: number
}

export type PaperSampleInput = Omit<PaperSample, 'id' | 'schemaRev'>
