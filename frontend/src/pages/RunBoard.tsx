import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { ProcessTimeline, type ProcessStep } from '../components/common/ProcessTimeline'
import { ReasonDialog } from '../components/common/ReasonDialog'
import { RevisionHistoryDialog } from '../components/common/RevisionHistoryDialog'
import { RulerInput } from '../components/common/RulerInput'
import { useUnitConvert } from '../hooks/useUnitConvert'
import { useFiberStore } from '../stores/fiberStore'
import { useMouldStore } from '../stores/mouldStore'
import { useRunChains, useRunStore } from '../stores/runStore'
import { DRY_METHODS, RUN_VERSION_STATUS_LABEL, STRIPE_DIRECTIONS, type DryMethod, type SheetRun, type SheetRunInput, type StripeDirection } from '../types/sheet-run'
import { calculateDeviation, getGapConclusion, isGapOutOfTolerance } from '../utils/stripe'
import { latestActiveVersion, standardGapOf, type RunChain } from '../utils/runChain'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const emptyRunForm: SheetRunInput = {
  runNo: '',
  mouldId: 1,
  batchId: 1,
  runDate: todayIso(),
  operator: '罗青禾',
  stripeDirection: '竖帘纹',
  dipCount: 2,
  stackHeight: 42,
  dryMethod: '火墙',
  grammage: 32,
  measuredGap: 1.1,
  deviation: 0,
}

const processSteps: ProcessStep[] = [
  { label: '浆料复核', detail: '核对料批打浆度与漂洗状态。', status: 'done' },
  { label: '帘床就位', detail: '确认纸帘方向与框架张力。', status: 'done' },
  { label: '入槽抄纸', detail: '按设定次数完成荡料与提帘。', status: 'active' },
  { label: '压榨定形', detail: '控制叠高后转火墙或日晒。', status: 'pending' },
  { label: '量纹偏差', detail: '实测间距并与纸帘标准值比较。', status: 'pending' },
]

type DialogMode =
  | { kind: 'none' }
  | { kind: 'correct'; chain: RunChain }
  | { kind: 'void'; chain: RunChain; version: SheetRun }

export default function RunBoard() {
  const chains = useRunChains()
  const runError = useRunStore((state) => state.error)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const addRun = useRunStore((state) => state.addRun)
  const correctRun = useRunStore((state) => state.correctRun)
  const voidRun = useRunStore((state) => state.voidRun)
  const moulds = useMouldStore((state) => state.moulds)
  const mouldError = useMouldStore((state) => state.error)
  const loadMoulds = useMouldStore((state) => state.loadMoulds)
  const batches = useFiberStore((state) => state.fiberBatches)
  const batchError = useFiberStore((state) => state.error)
  const loadBatches = useFiberStore((state) => state.loadFiberBatches)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<SheetRunInput>(emptyRunForm)
  const [dateFilter, setDateFilter] = useState('')
  const [mouldFilter, setMouldFilter] = useState('全部')
  const [draftGaps, setDraftGaps] = useState<Record<number, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [dialog, setDialog] = useState<DialogMode>({ kind: 'none' })
  const [historyChain, setHistoryChain] = useState<RunChain | null>(null)
  const { formatGrammage, cmToMm } = useUnitConvert()

  useEffect(() => {
    void loadRuns()
    void loadMoulds()
    void loadBatches()
  }, [loadBatches, loadMoulds, loadRuns])

  const mouldById = useMemo(() => new Map(moulds.map((mould) => [mould.id, mould])), [moulds])
  const batchById = useMemo(() => new Map(batches.map((batch) => [batch.id, batch])), [batches])
  const filteredChains = useMemo(
    () => chains.filter((chain) => {
      const head = latestActiveVersion(chain) ?? chain.head
      const mould = mouldById.get(head.mouldId)
      const mouldNo = head.mouldNoSnapshot ?? mould?.mouldNo
      const matchesDate = !dateFilter || head.runDate === dateFilter
      const matchesMould = mouldFilter === '全部' || mouldNo === mouldFilter
      return matchesDate && matchesMould
    }),
    [chains, dateFilter, mouldById, mouldFilter],
  )
  const latestChain = chains[0]
  const latestRun = latestChain ? (latestActiveVersion(latestChain) ?? latestChain.head) : undefined

  const selectedMould = mouldById.get(form.mouldId) ?? moulds[0]
  const formStandardGap = selectedMould?.stripeGap ?? form.measuredGap
  const formDeviation = calculateDeviation(form.measuredGap, formStandardGap)

  const updateForm = <K extends keyof SheetRunInput,>(key: K, value: SheetRunInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleMouldChange = (mouldId: number) => {
    setForm((current) => {
      const mould = mouldById.get(mouldId)
      const standardGap = mould?.stripeGap ?? current.measuredGap
      return { ...current, mouldId, measuredGap: standardGap, deviation: calculateDeviation(standardGap, standardGap) }
    })
  }

  const handleSubmit = async () => {
    if (!form.runNo.trim() || !form.operator.trim() || form.measuredGap <= 0 || form.grammage <= 0) return
    setSubmitting(true)
    const created = await addRun(
      { ...form, runNo: form.runNo.trim(), operator: form.operator.trim(), deviation: formDeviation },
      selectedMould,
    )
    setSubmitting(false)
    if (created) {
      setForm(emptyRunForm)
      setShowForm(false)
    }
  }

  const openCorrect = (chain: RunChain) => {
    const head = latestActiveVersion(chain)
    if (!head || head.id === undefined) return
    setDraftGaps((current) => ({ ...current, [head.id as number]: head.measuredGap }))
    setDialog({ kind: 'correct', chain })
  }

  const handleConfirmCorrect = async ({ reason, operator }: { reason: string; operator: string }) => {
    if (dialog.kind !== 'correct') return
    const head = latestActiveVersion(dialog.chain)
    if (!head || head.id === undefined) return
    const measuredGap = draftGaps[head.id] ?? head.measuredGap
    const created = await correctRun(head.id, { measuredGap, reason, revisedBy: operator })
    if (created) setDialog({ kind: 'none' })
  }

  const handleConfirmVoid = async ({ reason, operator }: { reason: string; operator: string }) => {
    if (dialog.kind !== 'void') return
    if (dialog.version.id === undefined) return
    const ok = await voidRun(dialog.version.id, reason, operator)
    if (ok) {
      setDialog({ kind: 'none' })
      setHistoryChain(null)
    }
  }

  const error = runError ?? mouldError ?? batchError
  const voidTarget = dialog.kind === 'void' ? dialog.version : null
  const dialogHead = dialog.kind === 'correct' ? latestActiveVersion(dialog.chain) : voidTarget

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box>
          <Typography component="h1" variant="h3" color="#344a34">抄纸工序记录台</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>每槽工序按修订链留档：复测更正保留上一版并写明原因，作废后仍可查，样本固定引用当时版本。</Typography>
        </Box>
        <Button variant="contained" size="large" onClick={() => setShowForm((current) => !current)} data-testid="new-run">
          {showForm ? '收起登记' : '新建工序'}
        </Button>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}

      {showForm && (
        <Card data-testid="form-run" sx={{ borderColor: '#9eb096' }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography variant="h5">登记抄纸工序</Typography>
              <Chip color={isGapOutOfTolerance(formDeviation) ? 'warning' : 'success'} label={`偏差 ${formDeviation > 0 ? '+' : ''}${formDeviation.toFixed(2)} mm`} />
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField fullWidth label="工序编号（槽号）" value={form.runNo} onChange={(event) => updateForm('runNo', event.target.value)} inputProps={{ 'data-testid': 'field-runNo' }} /></Grid>
              <Grid item xs={6} md={2.5}>
                <TextField select fullWidth label="纸帘" value={form.mouldId} onChange={(event) => handleMouldChange(Number(event.target.value))} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-mouldId' } }}>
                  {!moulds.some((mould) => mould.id === form.mouldId) && <option value={form.mouldId}>纸帘数据载入中</option>}
                  {moulds.filter((mould) => mould.state !== '退役').map((mould) => <option key={mould.id} value={mould.id}>{mould.mouldNo} · {mould.stripeGap} mm</option>)}
                </TextField>
              </Grid>
              <Grid item xs={6} md={2.5}>
                <TextField select fullWidth label="纤维料批" value={form.batchId} onChange={(event) => updateForm('batchId', Number(event.target.value))} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-batchId' } }}>
                  {!batches.some((batch) => batch.id === form.batchId) && <option value={form.batchId}>料批数据载入中</option>}
                  {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNo} · {batch.material}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={2}><TextField fullWidth type="date" label="抄纸日期" value={form.runDate} onChange={(event) => updateForm('runDate', event.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ 'data-testid': 'field-runDate' }} /></Grid>
              <Grid item xs={12} md={2}><TextField fullWidth label="操作人" value={form.operator} onChange={(event) => updateForm('operator', event.target.value)} inputProps={{ 'data-testid': 'field-operator' }} /></Grid>
              <Grid item xs={6} md={2}>
                <TextField select fullWidth label="帘纹方向" value={form.stripeDirection} onChange={(event) => updateForm('stripeDirection', event.target.value as StripeDirection)} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-stripeDirection' } }}>
                  {STRIPE_DIRECTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={6} md={2}><TextField fullWidth type="number" label="荡料次数" value={form.dipCount} onChange={(event) => updateForm('dipCount', Number(event.target.value))} inputProps={{ min: 1, max: 8, step: 1, 'data-testid': 'field-dipCount' }} /></Grid>
              <Grid item xs={6} md={2}><TextField fullWidth type="number" label="叠高" value={form.stackHeight} onChange={(event) => updateForm('stackHeight', Number(event.target.value))} inputProps={{ min: 10, max: 120, step: 1, 'data-testid': 'field-stackHeight' }} InputProps={{ endAdornment: '张' }} /></Grid>
              <Grid item xs={6} md={2}>
                <TextField select fullWidth label="干燥方式" value={form.dryMethod} onChange={(event) => updateForm('dryMethod', event.target.value as DryMethod)} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-dryMethod' } }}>
                  {DRY_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={6} md={2}><TextField fullWidth type="number" label="克重" value={form.grammage} onChange={(event) => updateForm('grammage', Number(event.target.value))} inputProps={{ min: 10, max: 200, step: 1, 'data-testid': 'field-grammage' }} InputProps={{ endAdornment: 'g/m²' }} /></Grid>
              <Grid item xs={12} md={4}>
                <RulerInput label="实测帘纹间距" value={form.measuredGap} onChange={(value) => updateForm('measuredGap', value)} min={0.1} max={5} step={0.01} testId="field-measuredGap" helperText={`${getGapConclusion(formDeviation)}，允许偏差 ±0.2 mm；标准 ${formStandardGap.toFixed(2)} mm 取自登记当时纸帘`} />
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2.5 }}>
              <Button onClick={() => setShowForm(false)}>取消</Button>
              <Button variant="contained" onClick={handleSubmit} disabled={submitting} data-testid="submit-run">保存工序</Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5 }}>最近一槽的工序进程</Typography>
              {latestRun ? (
                <>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                    <Chip size="small" label={latestRun.runNo} />
                    <Chip size="small" variant="outlined" label={`第 ${latestRun.versionNo ?? 1} 版 · ${RUN_VERSION_STATUS_LABEL[latestRun.status ?? 'active']}`} />
                    <Chip size="small" variant="outlined" label={formatGrammage(latestRun.grammage)} />
                  </Box>
                  <ProcessTimeline steps={processSteps} compact />
                </>
              ) : (
                <Typography color="text.secondary">等待工序数据。</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Grid container spacing={1.5} alignItems="center">
                <Grid item xs={12} sm={5} md={4}><TextField fullWidth size="small" type="date" label="按日期筛选" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                <Grid item xs={8} sm={5} md={4}>
                  <TextField select fullWidth size="small" label="按帘号筛选" value={mouldFilter} onChange={(event) => setMouldFilter(event.target.value)} SelectProps={{ native: true }}>
                    <option value="全部">全部纸帘</option>
                    {moulds.map((mould) => <option key={mould.id} value={mould.mouldNo}>{mould.mouldNo}</option>)}
                  </TextField>
                </Grid>
                <Grid item xs={4} md={2}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">工序槽数</Typography>
                    <Typography variant="h5" data-testid="count-run">{filteredChains.length}</Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={2}><Button fullWidth variant="outlined" onClick={() => { setDateFilter(''); setMouldFilter('全部') }}>重置</Button></Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <TableContainer component={Card}>
        <Table sx={{ minWidth: 1120 }}>
          <TableHead>
            <TableRow>
              <TableCell>工序 / 日期</TableCell>
              <TableCell>纸帘与料批</TableCell>
              <TableCell>抄纸参数</TableCell>
              <TableCell align="right">克重</TableCell>
              <TableCell>实测间距与偏差（当前版）</TableCell>
              <TableCell align="right">修订操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredChains.map((chain) => {
              const head = chain.head
              const current = latestActiveVersion(chain)
              const mould = mouldById.get(head.mouldId)
              const batch = batchById.get(head.batchId)
              const mouldNo = head.mouldNoSnapshot ?? mould?.mouldNo ?? '未关联纸帘'
              const versionCount = chain.versions.length
              const isVoided = chain.voided
              const draftGap = current && current.id !== undefined ? draftGaps[current.id] ?? current.measuredGap : current?.measuredGap ?? head.measuredGap
              const standardGap = current ? standardGapOf(current, mould?.stripeGap) : standardGapOf(head, mould?.stripeGap)
              const draftDeviation = calculateDeviation(draftGap, standardGap)
              const exceeded = isGapOutOfTolerance(draftDeviation)
              return (
                <TableRow
                  key={chain.chainId}
                  data-testid="row-run"
                  hover
                  sx={{ bgcolor: chain.hasConflict ? '#fdecea' : isVoided ? '#f4f4f2' : exceeded ? '#fff7d9' : undefined }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Typography sx={{ fontWeight: 750 }}>{head.runNo}</Typography>
                      <Chip size="small" variant="outlined" label={`共 ${versionCount} 版`} />
                      {isVoided && <Chip size="small" color="error" label="整槽已作废" data-testid="chain-void" />}
                      {chain.hasConflict && <Chip size="small" color="error" label="并列有效版" data-testid="chain-conflict" />}
                    </Box>
                    <Typography variant="caption" color="text.secondary">{head.runDate} · {head.operator} · 当前第 {current?.versionNo ?? head.versionNo ?? 1} 版</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{mouldNo}</Typography>
                    <Typography variant="caption" color="text.secondary">{batch?.batchNo ?? '未关联料批'} · {batch?.material ?? '待补'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{head.stripeDirection} · 荡料 {head.dipCount} 次</Typography>
                    <Typography variant="caption" color="text.secondary">叠高 {head.stackHeight} 张 · {head.dryMethod} · 帘框 {cmToMm(mould?.frameW ?? 0)} × {cmToMm(mould?.frameH ?? 0)} mm</Typography>
                  </TableCell>
                  <TableCell align="right">{(current ?? head).grammage} g/m²</TableCell>
                  <TableCell sx={{ minWidth: 290 }}>
                    {current ? (
                      <RulerInput
                        label={`帘纹间距（第 ${current.versionNo ?? 1} 版）`}
                        value={draftGap}
                        onChange={(value) => {
                          if (current.id !== undefined) setDraftGaps((state) => ({ ...state, [current.id as number]: value }))
                        }}
                        min={0.1}
                        max={5}
                        step={0.01}
                        testId={current.id === undefined ? undefined : `row-measuredGap-${current.id}`}
                        helperText={<Typography component="span" variant="caption" color={exceeded ? 'warning.dark' : 'text.secondary'}>{exceeded ? '超差：' : '合格：'}{getGapConclusion(draftDeviation)}（{draftDeviation > 0 ? '+' : ''}{draftDeviation.toFixed(2)} mm），标准 {standardGap.toFixed(2)} mm</Typography>}
                        compact
                      />
                    ) : chain.hasConflict ? (
                      <Stack spacing={0.75} data-testid="chain-conflict-detail">
                        {chain.activeVersions.map((version) => (
                          <Box key={version.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
                            <Typography variant="body2">
                              第 {version.versionNo ?? 1} 版：{version.measuredGap.toFixed(2)} mm，偏差 {version.deviation > 0 ? '+' : ''}{version.deviation.toFixed(2)} mm
                            </Typography>
                            <Button
                              size="small"
                              color="error"
                              onClick={() => setDialog({ kind: 'void', chain, version })}
                            >
                              作废此版
                            </Button>
                          </Box>
                        ))}
                        <Typography variant="caption" color="error.dark">两个版本并列有效，工序已标出并停止计入统计；作废其中一版即可恢复。</Typography>
                      </Stack>
                    ) : (
                      <Stack spacing={0.5}>
                        <Typography variant="body2" color="text.secondary">
                          实测 {head.measuredGap.toFixed(2)} mm · 偏差 {head.deviation > 0 ? '+' : ''}{head.deviation.toFixed(2)} mm
                        </Typography>
                        {isVoided && <Typography variant="caption" color="error.dark">作废原因：{chain.versions[chain.versions.length - 1]?.voidReason ?? '见修订历程'}</Typography>}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.75} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                      <Button size="small" onClick={() => setHistoryChain(chain)} data-testid="history-run">修订历程</Button>
                      <Button
                        size="small"
                        variant={exceeded && current ? 'contained' : 'outlined'}
                        color={exceeded ? 'warning' : 'primary'}
                        disabled={!current || current.id === undefined || draftGap === current.measuredGap || chain.hasConflict}
                        onClick={() => openCorrect(chain)}
                        data-testid="correct-run"
                      >
                        复测更正
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={!current || current.id === undefined}
                        onClick={() => {
                          const active = latestActiveVersion(chain)
                          if (active && !chain.hasConflict) setDialog({ kind: 'void', chain, version: active })
                        }}
                        data-testid="void-run"
                      >
                        作废
                      </Button>
                    </Stack>
                    {chain.hasConflict && (
                      <Typography variant="caption" color="error.dark" sx={{ display: 'block', mt: 0.5 }}>
                        存在 {chain.activeVersions.length} 个并列有效版，已停止计入统计
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {filteredChains.length === 0 && (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}>没有符合日期与帘号条件的工序</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <ReasonDialog
        open={dialog.kind === 'correct'}
        title={`复测更正 · ${dialog.kind === 'correct' ? dialog.chain.runNo : ''}`}
        description={dialog.kind === 'correct' && dialogHead ? `将基于第 ${dialogHead.versionNo ?? 1} 版生成新版，上一版自动标记为历史版并保留；标准间距沿用 ${standardGapOf(dialogHead).toFixed(2)} mm。` : undefined}
        confirmLabel="生成更正版"
        defaultOperator={dialogHead?.revisedBy ?? dialogHead?.operator ?? ''}
        onConfirm={handleConfirmCorrect}
        onClose={() => setDialog({ kind: 'none' })}
      />
      <ReasonDialog
        open={dialog.kind === 'void'}
        title={`作废工序 · ${dialog.kind === 'void' ? dialog.chain.runNo : ''}`}
        description={voidTarget ? `将作废 ${dialog.kind === 'void' ? dialog.chain.runNo : ''} 的第 ${voidTarget.versionNo ?? 1} 版。作废后该版本仍可在修订历程中查阅，关联样本页会标明失效，且不再计入工作台统计。` : undefined}
        confirmLabel="确认作废"
        defaultOperator={voidTarget?.operator ?? ''}
        onConfirm={handleConfirmVoid}
        onClose={() => setDialog({ kind: 'none' })}
      />
      <RevisionHistoryDialog
        open={historyChain !== null}
        chain={historyChain}
        onVoidVersion={(version) => historyChain && setDialog({ kind: 'void', chain: historyChain, version })}
        onClose={() => setHistoryChain(null)}
      />
    </Stack>
  )
}
