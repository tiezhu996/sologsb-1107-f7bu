export const STRIPE_DIRECTIONS = ['竖帘纹', '横帘纹'] as const
export type StripeDirection = (typeof STRIPE_DIRECTIONS)[number]

export const DRY_METHODS = ['火墙', '日晒'] as const
export type DryMethod = (typeof DRY_METHODS)[number]

/** 工序版本状态：有效 / 已被新版替代 / 已作废 */
export const RUN_VERSION_STATUSES = ['active', 'superseded', 'void'] as const
export type RunVersionStatus = (typeof RUN_VERSION_STATUSES)[number]

export const RUN_VERSION_STATUS_LABEL: Record<RunVersionStatus, string> = {
  active: '有效版',
  superseded: '历史版',
  void: '已作废',
}

/** 版本来源：旧数据升级形成的基线版，或师傅复测后形成的更正版 */
export const RUN_REVISION_KINDS = ['baseline', 'correction'] as const
export type RunRevisionKind = (typeof RUN_REVISION_KINDS)[number]

export const RUN_REVISION_KIND_LABEL: Record<RunRevisionKind, string> = {
  baseline: '基线版',
  correction: '更正版',
}

export interface SheetRun {
  id?: number
  runNo: string
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

  // 修订链（schema v3）
  /** 同一槽工序的归属链，取基线版记录 id */
  chainId?: number
  /** 链内版本序号，从 1 开始 */
  versionNo?: number
  status?: RunVersionStatus
  revisionKind?: RunRevisionKind
  /** 本次更正/作废的原因；基线版可为空 */
  revisionReason?: string
  revisedBy?: string
  revisedAt?: string
  /** 上一版记录 id，基线版为空 */
  prevVersionId?: number
  /** 作废原因与操作留痕（作废不再产生新版本） */
  voidReason?: string
  voidedBy?: string
  voidedAt?: string

  // 登记/更正当时的纸帘快照：纸帘修补只影响新工序，不回改历史
  standardGap?: number
  mouldNoSnapshot?: string
  wireDiameterSnapshot?: number
  meshDensitySnapshot?: number
}

export type SheetRunInput = Pick<
  SheetRun,
  | 'runNo'
  | 'mouldId'
  | 'batchId'
  | 'runDate'
  | 'operator'
  | 'stripeDirection'
  | 'dipCount'
  | 'stackHeight'
  | 'dryMethod'
  | 'grammage'
  | 'measuredGap'
  | 'deviation'
>

export interface CorrectRunInput {
  measuredGap: number
  reason: string
  revisedBy: string
}
