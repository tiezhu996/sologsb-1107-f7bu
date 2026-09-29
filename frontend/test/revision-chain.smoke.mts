// 修订链端到端冒烟测试：v2 旧库 → v3 升级 → 更正/作废/冲突/样本引用
import 'fake-indexeddb/auto'
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'

// --- 1. 先构造一个 v2 结构的旧库（含缺字段老记录） ---
async function seedOldDatabase() {
  const oldDb = new Dexie('gbpapermill-db')
  oldDb.version(2).stores({
    moulds: '++id,&mouldNo,state,wireMaterial,schemaRev',
    fiberBatches: '++id,&batchNo,material,beatingDegree,schemaRev',
    sheetRuns: '++id,&runNo,mouldId,batchId,runDate,operator,schemaRev',
    paperSamples: '++id,&sampleNo,runId,evenness,stripeCount,schemaRev',
  })
  await oldDb.moulds.bulkAdd([
    { id: 1, mouldNo: 'DL-01', frameW: 60, frameH: 90, wireMaterial: '竹丝', wireDiameter: 0.3, stripeGap: 1.1, meshDensity: 7.1, weaver: '周守良', state: '在用', schemaRev: 2 },
  ])
  await oldDb.fiberBatches.bulkAdd([
    { id: 1, batchNo: 'XW-2601', material: '构皮', origin: '陕西洋县', cookAgent: '石灰', cookHours: 9, bleachMethod: '日晒', beatingDegree: 32, operator: '罗青禾', schemaRev: 2 },
  ])
  await oldDb.sheetRuns.bulkAdd([
    { id: 1, runNo: 'CB-01', mouldId: 1, batchId: 1, runDate: '2026-09-28', operator: '罗青禾', stripeDirection: '竖帘纹', dipCount: 2, stackHeight: 42, dryMethod: '火墙', grammage: 32, measuredGap: 1.36, deviation: 0.26, schemaRev: 2 },
    { id: 2, runNo: 'CB-02', mouldId: 1, batchId: 1, runDate: '2026-09-27', operator: '汪知远', stripeDirection: '横帘纹', dipCount: 1, stackHeight: 30, dryMethod: '日晒', grammage: 28, measuredGap: 1.0, deviation: -0.1, schemaRev: 2 },
  ])
  await oldDb.paperSamples.bulkAdd([
    { id: 1, sampleNo: 'YZ-01', runId: 1, sizeMm: 210, stripeCount: 46, evenness: '略花', archiveBin: '甲柜-03', schemaRev: 2 },
  ])
  await oldDb.close()
}

let db

before(async () => {
  await seedOldDatabase()

  // --- 2. 用应用代码（v3）打开同一个库，触发 upgrade ---
  // 动态加载应用 db（tsx 直接跑 TS）
  ;({ db } = await import('../src/utils/db.ts'))
  await db.open()
})

test('旧数据升级：工序补成基线版并固化纸帘快照', async () => {
  const run = await db.sheetRuns.get(1)
  assert.equal(run.chainId, 1)
  assert.equal(run.versionNo, 1)
  assert.equal(run.status, 'active')
  assert.equal(run.revisionKind, 'baseline')
  assert.equal(run.standardGap, 1.1)
  assert.equal(run.mouldNoSnapshot, 'DL-01')
  assert.equal(run.wireDiameterSnapshot, 0.3)
  assert.equal(run.meshDensitySnapshot, 7.1)
  assert.equal(run.schemaRev, 3)
})

test('旧数据升级：样本固定引用基线版本，缺字段照补', async () => {
  const sample = await db.paperSamples.get(1)
  assert.equal(sample.runVersionId, 1)
  assert.equal(sample.baseline, true)
  assert.equal(sample.schemaRev, 3)
})

test('runNo 不再唯一：同槽可以存在多条版本记录', async () => {
  // 手工模拟一次更正（store 逻辑）：上一版变 superseded，新版继承快照
  await db.transaction('rw', db.sheetRuns, async () => {
    const current = await db.sheetRuns.get(2)
    const next = {
      ...current,
      id: undefined,
      measuredGap: 1.05,
      deviation: Number((1.05 - current.standardGap).toFixed(2)),
      versionNo: 2,
      status: 'active',
      revisionKind: 'correction',
      revisionReason: '师傅复测，初次读数偏密',
      revisedBy: '罗青禾',
      revisedAt: new Date().toISOString(),
      prevVersionId: 2,
    }
    const newId = Number(await db.sheetRuns.add(next))
    await db.sheetRuns.update(2, { status: 'superseded' })
    assert.ok(newId > 2)
  })
  const versions = await db.sheetRuns.where('chainId').equals(2).toArray()
  assert.equal(versions.length, 2)
  assert.equal(versions[0].status, 'superseded')
  assert.equal(versions[1].status, 'active')
  assert.equal(versions[1].revisionReason, '师傅复测，初次读数偏密')
  assert.equal(versions[1].standardGap, 1.1) // 快照随版本继承
})

test('修订链工具：链归集、统计口径与样本状态', async () => {
  const { buildRunChains, latestActiveVersion, resolveSampleRunState, statisticallyCountedRuns, standardGapOf } = await import('../src/utils/runChain.ts')
  const runs = await db.sheetRuns.toArray()
  const chains = buildRunChains(runs)
  assert.equal(chains.length, 2)
  const counted = statisticallyCountedRuns(chains)
  assert.equal(counted.length, 2)
  assert.equal(counted.find((r) => r.runNo === 'CB-02').versionNo, 2) // 只统计最新版

  const samples = await db.paperSamples.toArray()
  // YZ-01 仍引用 CB-01 基线版（CB-01 未被更正，active）
  assert.equal(resolveSampleRunState(samples[0], chains), 'active')

  // 纸帘修补改变当前 stripeGap，不应影响版本 standardGap
  const cb01 = runs.find((r) => r.id === 1)
  assert.equal(standardGapOf(cb01, 1.25), 1.1)
})

test('作废后仍可查阅；样本页失效；全链作废退出统计', async () => {
  const { buildRunChains, latestActiveVersion, resolveSampleRunState, statisticallyCountedRuns } = await import('../src/utils/runChain.ts')
  await db.sheetRuns.update(1, { status: 'void', voidReason: '浆料污染，整槽弃用', voidedBy: '罗青禾', voidedAt: new Date().toISOString() })
  const runs = await db.sheetRuns.toArray()
  const chains = buildRunChains(runs)
  const chain1 = chains.find((c) => c.chainId === 1)
  assert.equal(chain1.voided, true)
  assert.equal(latestActiveVersion(chain1), null)
  assert.equal(statisticallyCountedRuns(chains).length, 1) // CB-01 退出统计

  const samples = await db.paperSamples.toArray()
  assert.equal(resolveSampleRunState(samples[0], chains), 'void') // YZ-01 标明失效

  const stillThere = await db.sheetRuns.get(1)
  assert.equal(stillThere.voidReason, '浆料污染，整槽弃用') // 作废记录仍可查
})

test('并列有效版：hasConflict 且停止计入统计', async () => {
  const { buildRunChains, latestActiveVersion, resolveSampleRunState, statisticallyCountedRuns } = await import('../src/utils/runChain.ts')
  // 人为再造一个 CB-02 的 active 版（模拟异常并列）
  const v2 = await db.sheetRuns.where({ chainId: 2, status: 'active' }).first()
  await db.sheetRuns.add({
    ...v2,
    id: undefined,
    versionNo: 3,
    measuredGap: 1.2,
    deviation: 0.1,
    revisionReason: '另一路复测',
    revisedAt: new Date().toISOString(),
  })
  const runs = await db.sheetRuns.toArray()
  const chains = buildRunChains(runs)
  const chain2 = chains.find((c) => c.chainId === 2)
  assert.equal(chain2.hasConflict, true)
  assert.equal(latestActiveVersion(chain2), null)
  assert.equal(statisticallyCountedRuns(chains).length, 0)

  // 作废其中一版后恢复
  const actives = chain2.activeVersions
  await db.sheetRuns.update(actives[1].id, { status: 'void', voidReason: '重复登记作废', voidedBy: '罗青禾', voidedAt: new Date().toISOString() })
  const runs2 = await db.sheetRuns.toArray()
  const chains2 = buildRunChains(runs2)
  const chain2b = chains2.find((c) => c.chainId === 2)
  assert.equal(chain2b.hasConflict, false)
  assert.ok(latestActiveVersion(chain2b) !== null)
  assert.equal(statisticallyCountedRuns(chains2).length, 1)
})
