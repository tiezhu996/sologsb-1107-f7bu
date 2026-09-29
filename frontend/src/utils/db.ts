import Dexie, { type Table } from 'dexie'
import type { FiberBatch } from '../types/fiber-batch'
import type { Mould } from '../types/mould'
import type { PaperSample } from '../types/paper-sample'
import type { SheetRun } from '../types/sheet-run'
import { calculateDeviation, calculateMeshDensity } from './stripe'

export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function currentWeekDate(dayOffset: number): string {
  const date = new Date()
  const day = date.getDay()
  const mondayDistance = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + mondayDistance + dayOffset)
  return date.toISOString().slice(0, 10)
}

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

/** 版本建立时间：基线版取抄纸日期上午，演示数据统一时间形态。 */
function revisedAt(runDate: string): string {
  return `${runDate}T09:00:00.000Z`
}

const seedMoulds: Mould[] = [
  { id: 1, mouldNo: 'DL-01', frameW: 60, frameH: 90, wireMaterial: '竹丝', wireDiameter: 0.3, stripeGap: 1.1, meshDensity: calculateMeshDensity(0.3, 1.1), weaver: '周守良', state: '在用', schemaRev: 3 },
  { id: 2, mouldNo: 'DL-02', frameW: 55, frameH: 82, wireMaterial: '铜丝', wireDiameter: 0.2, stripeGap: 0.85, meshDensity: calculateMeshDensity(0.2, 0.85), weaver: '沈云舟', state: '在用', schemaRev: 3 },
  { id: 3, mouldNo: 'DL-03', frameW: 72, frameH: 105, wireMaterial: '竹丝', wireDiameter: 0.28, stripeGap: 1.0, meshDensity: calculateMeshDensity(0.28, 1), weaver: '周守良', state: '在用', schemaRev: 3 },
  { id: 4, mouldNo: 'DL-04', frameW: 50, frameH: 76, wireMaterial: '马尾丝', wireDiameter: 0.32, stripeGap: 1.25, meshDensity: calculateMeshDensity(0.32, 1.25), weaver: '林砚秋', state: '待修补', schemaRev: 3 },
  { id: 5, mouldNo: 'DL-05', frameW: 65, frameH: 96, wireMaterial: '铜丝', wireDiameter: 0.18, stripeGap: 0.72, meshDensity: calculateMeshDensity(0.18, 0.72), weaver: '沈云舟', state: '退役', schemaRev: 3 },
]

const seedBatches: FiberBatch[] = [
  { id: 1, batchNo: 'XW-2601', material: '构皮', origin: '陕西洋县华阳镇', cookAgent: '石灰', cookHours: 9, bleachMethod: '日晒', beatingDegree: 32, operator: '罗青禾', schemaRev: 3 },
  { id: 2, batchNo: 'XW-2602', material: '桑皮', origin: '安徽泾县小岭村', cookAgent: '纯碱', cookHours: 7, bleachMethod: '日晒', beatingDegree: 38, operator: '汪知远', schemaRev: 3 },
  { id: 3, batchNo: 'XW-2603', material: '竹麻', origin: '四川夹江马村镇', cookAgent: '石灰', cookHours: 11, bleachMethod: '漂白粉', beatingDegree: 27, operator: '郭文山', schemaRev: 3 },
  { id: 4, batchNo: 'XW-2604', material: '稻草', origin: '浙江富阳大源镇', cookAgent: '纯碱', cookHours: 6, bleachMethod: '日晒', beatingDegree: 24, operator: '蒋允中', schemaRev: 3 },
  { id: 5, batchNo: 'XW-2605', material: '构皮', origin: '贵州丹寨石桥村', cookAgent: '石灰', cookHours: 8, bleachMethod: '漂白粉', beatingDegree: 35, operator: '罗青禾', schemaRev: 3 },
]

const gap1 = 1.1
const gap2 = 0.85
const gap3 = 1.0
const gap4 = 0.72

/** 基线版（v1）：每槽工序的原始登记。 */
function baselineRun(
  id: number,
  runNo: string,
  mouldId: number,
  batchId: number,
  runDate: string,
  operator: string,
  stripeDirection: SheetRun['stripeDirection'],
  dipCount: number,
  stackHeight: number,
  dryMethod: SheetRun['dryMethod'],
  grammage: number,
  measuredGap: number,
  standardGap: number,
): SheetRun {
  return {
    id,
    runNo,
    versionNo: 1,
    prevId: null,
    reason: '基线版',
    voided: false,
    voidReason: '',
    voidedAt: null,
    revisedAt: revisedAt(runDate),
    mouldId,
    batchId,
    runDate,
    operator,
    stripeDirection,
    dipCount,
    stackHeight,
    dryMethod,
    grammage,
    measuredGap,
    standardGap,
    deviation: calculateDeviation(measuredGap, standardGap),
    schemaRev: 3,
  }
}

const seedRuns: SheetRun[] = [
  baselineRun(1, 'CB-260701', 1, 1, currentWeekDate(0), '罗青禾', '竖帘纹', 2, 42, '火墙', 32, 1.08, gap1),
  baselineRun(2, 'CB-260702', 2, 2, currentWeekDate(1), '汪知远', '竖帘纹', 1, 36, '火墙', 29, 0.84, gap2),
  baselineRun(3, 'CB-260703', 3, 3, currentWeekDate(2), '郭文山', '横帘纹', 2, 48, '日晒', 41, 1.03, gap3),
  baselineRun(4, 'CB-260704', 1, 5, daysAgo(3), '罗青禾', '竖帘纹', 3, 55, '火墙', 36, 1.36, gap1),
  baselineRun(5, 'CB-260705', 2, 4, daysAgo(6), '蒋允中', '竖帘纹', 2, 44, '日晒', 46, 0.82, gap2),
  baselineRun(6, 'CB-260706', 3, 2, daysAgo(10), '汪知远', '竖帘纹', 1, 31, '火墙', 27, 0.94, gap3),
  baselineRun(7, 'CB-260707', 4, 1, daysAgo(17), '林砚秋', '横帘纹', 2, 39, '日晒', 34, 1.5, 1.25),
  baselineRun(8, 'CB-260708', 5, 3, daysAgo(24), '郭文山', '竖帘纹', 2, 46, '火墙', 44, 0.71, gap4),
  // CB-260701 的复测更正版：保留 v1 历史，偏差按更正后间距重算
  {
    id: 9,
    runNo: 'CB-260701',
    versionNo: 2,
    prevId: 1,
    reason: '成纸偏密，复测修正间距',
    voided: false,
    voidReason: '',
    voidedAt: null,
    revisedAt: `${currentWeekDate(0)}T15:30:00.000Z`,
    mouldId: 1,
    batchId: 1,
    runDate: currentWeekDate(0),
    operator: '罗青禾',
    stripeDirection: '竖帘纹',
    dipCount: 2,
    stackHeight: 42,
    dryMethod: '火墙',
    grammage: 32,
    measuredGap: 1.12,
    standardGap: gap1,
    deviation: calculateDeviation(1.12, gap1),
    schemaRev: 3,
  },
  // CB-260707 的复测版已作废：作废后仍留档可查，当前有效版回到 v1
  {
    id: 10,
    runNo: 'CB-260707',
    versionNo: 2,
    prevId: 7,
    reason: '复测帘纹间距',
    voided: true,
    voidReason: '作废：复测记录抄录有误，恢复以 v1 为准',
    voidedAt: `${daysAgo(15)}T10:00:00.000Z`,
    revisedAt: `${daysAgo(16)}T10:00:00.000Z`,
    mouldId: 4,
    batchId: 1,
    runDate: daysAgo(17),
    operator: '林砚秋',
    stripeDirection: '横帘纹',
    dipCount: 2,
    stackHeight: 39,
    dryMethod: '日晒',
    grammage: 34,
    measuredGap: 1.52,
    standardGap: 1.25,
    deviation: calculateDeviation(1.52, 1.25),
    schemaRev: 3,
  },
]

const seedSamples: PaperSample[] = [
  { id: 1, sampleNo: 'YZ-01', runVersionId: 1, sizeMm: 210, stripeCount: 46, evenness: '均匀', archiveBin: '甲柜-03', schemaRev: 3 },
  { id: 2, sampleNo: 'YZ-02', runVersionId: 2, sizeMm: 180, stripeCount: 52, evenness: '略花', archiveBin: '甲柜-07', schemaRev: 3 },
  { id: 3, sampleNo: 'YZ-03', runVersionId: 3, sizeMm: 240, stripeCount: 39, evenness: '花', archiveBin: '乙柜-02', schemaRev: 3 },
  { id: 4, sampleNo: 'YZ-04', runVersionId: 4, sizeMm: 210, stripeCount: 31, evenness: '略花', archiveBin: '乙柜-05', schemaRev: 3 },
  { id: 5, sampleNo: 'YZ-05', runVersionId: 5, sizeMm: 200, stripeCount: 48, evenness: '均匀', archiveBin: '甲柜-11', schemaRev: 3 },
  { id: 6, sampleNo: 'YZ-06', runVersionId: 6, sizeMm: 260, stripeCount: 57, evenness: '均匀', archiveBin: '丙柜-01', schemaRev: 3 },
  // YZ-07 钉在已作废的 v2 版上：样本页应标明「失效」
  { id: 7, sampleNo: 'YZ-07', runVersionId: 10, sizeMm: 210, stripeCount: 33, evenness: '略花', archiveBin: '乙柜-08', schemaRev: 3 },
]

class GbPaperMillDatabase extends Dexie {
  moulds!: Table<Mould, number>
  fiberBatches!: Table<FiberBatch, number>
  sheetRuns!: Table<SheetRun, number>
  paperSamples!: Table<PaperSample, number>

  constructor() {
    super('gbpapermill-db')
    this.version(1).stores({
      moulds: '++id,&mouldNo,state,wireMaterial',
      fiberBatches: '++id,&batchNo,material,beatingDegree',
      sheetRuns: '++id,&runNo,mouldId,batchId,runDate,operator',
      paperSamples: '++id,&sampleNo,runId,evenness,stripeCount',
    })
    this.version(2).stores({
      moulds: '++id,&mouldNo,state,wireMaterial,schemaRev',
      fiberBatches: '++id,&batchNo,material,beatingDegree,schemaRev',
      sheetRuns: '++id,&runNo,mouldId,batchId,runDate,operator,schemaRev',
      paperSamples: '++id,&sampleNo,runId,evenness,stripeCount,schemaRev',
    }).upgrade(async (transaction) => {
      await transaction.table('moulds').toCollection().modify((value: Record<string, unknown>) => {
        value.schemaRev = 2
      })
      await transaction.table('fiberBatches').toCollection().modify((value: Record<string, unknown>) => {
        value.schemaRev = 2
      })
      await transaction.table('sheetRuns').toCollection().modify((value: Record<string, unknown>) => {
        value.schemaRev = 2
      })
      await transaction.table('paperSamples').toCollection().modify((value: Record<string, unknown>) => {
        value.schemaRev = 2
      })
    })
    // v3：工序修订链 + 样本钉版。
    // 存量工序补成基线版（v1），样本固定引用当时工序记录；缺字段的老记录照常保留。
    this.version(3).stores({
      moulds: '++id,&mouldNo,state,wireMaterial,schemaRev',
      fiberBatches: '++id,&batchNo,material,beatingDegree,schemaRev',
      // runNo 不再唯一：同一槽可有多个版本记录
      sheetRuns: '++id,runNo,versionNo,mouldId,batchId,runDate,operator,schemaRev,voided',
      // 样本改为引用具体工序版本记录
      paperSamples: '++id,&sampleNo,runVersionId,evenness,stripeCount,schemaRev',
    }).upgrade(async (transaction) => {
      await transaction.table('sheetRuns').toCollection().modify((value: Record<string, unknown>) => {
        if (typeof value.versionNo !== 'number' || !Number.isFinite(value.versionNo)) value.versionNo = 1
        if (value.prevId === undefined) value.prevId = null
        if (typeof value.reason !== 'string' || !value.reason.trim()) value.reason = '基线版'
        if (typeof value.voided !== 'boolean') value.voided = false
        if (value.voidReason === undefined) value.voidReason = ''
        if (value.voidedAt === undefined) value.voidedAt = null
        if (value.revisedAt === undefined) {
          value.revisedAt = typeof value.runDate === 'string' ? revisedAt(value.runDate) : null
        }
        if (value.standardGap === undefined || value.standardGap === null) {
          // 由实测间距与偏差反推制版时的纸帘标准间距快照
          const measured = Number(value.measuredGap)
          const deviation = Number(value.deviation)
          value.standardGap = Number.isFinite(measured) && Number.isFinite(deviation)
            ? Number((measured - deviation).toFixed(2))
            : null
        }
        value.schemaRev = 3
      })
      await transaction.table('paperSamples').toCollection().modify((value: Record<string, unknown>) => {
        if (value.runVersionId === undefined || value.runVersionId === null) {
          value.runVersionId = value.runId ?? null
        }
        delete value.runId
        value.schemaRev = 3
      })
      await transaction.table('moulds').toCollection().modify((value: Record<string, unknown>) => {
        value.schemaRev = 3
      })
      await transaction.table('fiberBatches').toCollection().modify((value: Record<string, unknown>) => {
        value.schemaRev = 3
      })
    })
    this.on('populate', () => this.seed())
  }

  private async seed(): Promise<void> {
    await this.moulds.bulkAdd(plain(seedMoulds))
    await this.fiberBatches.bulkAdd(plain(seedBatches))
    await this.sheetRuns.bulkAdd(plain(seedRuns))
    await this.paperSamples.bulkAdd(plain(seedSamples))
  }
}

export const db = new GbPaperMillDatabase()
