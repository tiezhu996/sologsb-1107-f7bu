import { useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'

interface ReasonDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  initialReason?: string
  defaultOperator?: string
  operatorLabel?: string
  operatorEditable?: boolean
  onConfirm: (payload: { reason: string; operator: string }) => void
  onClose: () => void
}

/** 更正 / 作废时必填原因的确认对话框 */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  initialReason = '',
  defaultOperator = '',
  operatorLabel = '操作人',
  operatorEditable = true,
  onConfirm,
  onClose,
}: ReasonDialogProps) {
  const [reason, setReason] = useState(initialReason)
  const [operator, setOperator] = useState(defaultOperator)

  useEffect(() => {
    if (open) {
      setReason(initialReason)
      setOperator(defaultOperator)
    }
  }, [open, initialReason, defaultOperator])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {description && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{description}</Typography>}
        <TextField
          autoFocus
          fullWidth
          required
          multiline
          minRows={2}
          label="原因"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          inputProps={{ 'data-testid': 'field-reason' }}
          sx={{ mb: 2, mt: description ? 0 : 1 }}
        />
        <TextField
          fullWidth
          disabled={!operatorEditable}
          label={operatorLabel}
          value={operator}
          onChange={(event) => setOperator(event.target.value)}
          inputProps={{ 'data-testid': 'field-revisedBy' }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          color="warning"
          disabled={!reason.trim()}
          data-testid="confirm-reason"
          onClick={() => onConfirm({ reason: reason.trim(), operator: operator.trim() || defaultOperator })}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
