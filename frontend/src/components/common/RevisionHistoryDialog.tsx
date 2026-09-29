import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import {
  RUN_REVISION_KIND_LABEL,
  RUN_VERSION_STATUS_LABEL,
  type RunVersionStatus,
  type SheetRun,
} from '../../types/sheet-run'
import { getGapConclusion } from '../../utils/stripe'

interface RevisionHistoryDialogProps {
  open: boolean
  chain: { runNo: string; versions: SheetRun[] } | null
  onVoidVersion?: (version: SheetRun) => void
  onClose: () => void
}

function statusColor(status: RunVersionStatus | undefined): 'success' | 'default' | 'error' {
  if (status === 'active') return 'success'
  if (status === 'void') return 'error'
  return 'default'
}

function formatTime(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

/** 展示同一槽工序的全部版本：作废版仍可查阅，每一版写明更正原因 */
export function RevisionHistoryDialog({ open, chain, onVoidVersion, onClose }: RevisionHistoryDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>修订历程 · {chain?.runNo ?? ''}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {(chain?.versions ?? []).slice().reverse().map((version) => {
            const status = version.status ?? 'active'
            const kind = version.revisionKind ?? 'baseline'
            return (
              <Stack
                key={version.id}
                spacing={0.75}
                sx={{
                  p: 1.75,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: status === 'void' ? '#e3bdbd' : '#d8cfbb',
                  bgcolor: status === 'void' ? '#fbf1f1' : '#fbf7ee',
                  opacity: status === 'void' ? 0.85 : 1,
                }}
                data-testid="history-version"
              >
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography sx={{ fontWeight: 750 }}>第 {version.versionNo ?? 1} 版</Typography>
                  <Chip size="small" color={statusColor(status)} label={RUN_VERSION_STATUS_LABEL[status]} />
                  <Chip size="small" variant="outlined" label={RUN_REVISION_KIND_LABEL[kind]} />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>{formatTime(version.revisedAt)}</Typography>
                </Stack>
                <Typography variant="body2">
                  实测间距 {version.measuredGap.toFixed(2)} mm，标准 {version.standardGap?.toFixed(2) ?? '—'} mm，
                  偏差 {version.deviation > 0 ? '+' : ''}{version.deviation.toFixed(2)} mm（{getGapConclusion(version.deviation)}）
                </Typography>
                {version.revisionReason && (
                  <Typography variant="body2" color="text.secondary">更正原因：{version.revisionReason}（{version.revisedBy ?? '操作人待补'}）</Typography>
                )}
                {status === 'void' && (
                  <Typography variant="body2" color="error.dark">作废原因：{version.voidReason ?? '原因待补'}（{version.voidedBy ?? '操作人待补'} · {formatTime(version.voidedAt)}）</Typography>
                )}
                {status === 'active' && onVoidVersion && (
                  <Box>
                    <Button size="small" color="error" variant="outlined" onClick={() => onVoidVersion(version)} data-testid="void-version">
                      作废此版
                    </Button>
                  </Box>
                )}
              </Stack>
            )
          })}
          <Divider />
          <Typography variant="caption" color="text.secondary">样本固定引用登记当时的版本；纸帘后续修补不会改变这里的标准间距与偏差。</Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  )
}
