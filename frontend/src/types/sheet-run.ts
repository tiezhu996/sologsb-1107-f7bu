export const STRIPE_DIRECTIONS = ['竖帘纹', '横帘纹'] as const
export type StripeDirection = (typeof STRIPE_DIRECTIONS)[number]

export const DRY_METHODS = ['火墙', '日晒'] as const
export type DryMethod = (typeof DRY_METHODS)[number]

/**
 * 抄纸工序版本记录。
 * 同一槽（runNo）可有多个版本：v1 为基线版，复测更正生成 v2、v3……
 * 每个版本保留当时的纸帘标准间距快照（standardGap），纸帘修补只影响新版本，不回改历史。
 */
export interface SheetRun {
  id?: number
  /** 槽号，同一槽的所有版本共用 */
  runNo: string
  /** 版本号，从 1 开始 */
  versionNo: number
  /** 上一版记录 id，基线版为 null */
  prevId: number | null
  /** 更正原因；基线版为「基线版」 */
  reason: string
  /** 本版是否作废 */
  voided: boolean
  /** 作废原因 */
  voidReason: string
  /** 作废时间 ISO 字符串 */
  voidedAt: string | null
  /** 本版建立时间 ISO 字符串 */
  revisedAt: string | null
  /** 制版时纸帘标准间距快照 (mm) */
  standardGap: number | null
  mouldId: number
  batchId: number
  runDate: string
  operator: string
  stripeDirection: StripeDirection
  dipCount: number
  stackHeight: number
  dryMethod: DryMethod
  grammage: number
  measuredGap: number
  deviation: number
  schemaRev?: number
}

/** 登记表单字段（版本信息由 store 补全） */
export type SheetRunInput = Omit<
  SheetRun,
  | 'id'
  | 'schemaRev'
  | 'versionNo'
  | 'prevId'
  | 'reason'
  | 'voided'
  | 'voidReason'
  | 'voidedAt'
  | 'revisedAt'
  | 'standardGap'
>
