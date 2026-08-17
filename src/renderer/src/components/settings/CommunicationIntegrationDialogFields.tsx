import { Loader2 } from 'lucide-react'
import type { CommunicationSecretMutation } from '../../../../shared/communication-integrations'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'

export type CommunicationIntegrationPendingOperation =
  | 'save'
  | 'clear'
  | 'test'
  | 'prepare'
  | 'discard'
  | 'validate'
  | 'cancel-validation'
  | null

export function CommunicationIntegrationDialogFrame(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  providerName: string
  description: string
  configured: boolean
  pending: CommunicationIntegrationPendingOperation
  saveDisabled: boolean
  error: string | null
  onSave: () => Promise<boolean>
  onClear: () => Promise<boolean>
  saveLabel?: string
  savingLabel?: string
  closeOnSave?: boolean
  footer?: React.ReactNode
  clearConfirmation?: {
    title: string
    description: string
    confirmLabel: string
    buttonLabel: string
  }
  children: React.ReactNode
}): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const busy = props.pending !== null

  const clear = async (): Promise<void> => {
    const approved = await confirm({
      title:
        props.clearConfirmation?.title ??
        translate(
          'communicationIntegrations.dialog.clearTitle',
          'Clear {{provider}} integration?',
          { provider: props.providerName }
        ),
      description:
        props.clearConfirmation?.description ??
        translate(
          'communicationIntegrations.dialog.clearDescription',
          'This removes the saved credentials from this computer.'
        ),
      confirmLabel:
        props.clearConfirmation?.confirmLabel ??
        translate('communicationIntegrations.dialog.clearConfirm', 'Clear integration'),
      confirmVariant: 'destructive'
    })
    if (approved && (await props.onClear())) {
      props.onOpenChange(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(next) => !busy && props.onOpenChange(next)}>
      <DialogContent className="scrollbar-sleek max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {translate('communicationIntegrations.dialog.title', 'Configure {{provider}}', {
              provider: props.providerName
            })}
          </DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">{props.children}</div>
        {props.error ? (
          <p role="alert" className="text-xs text-destructive">
            {props.error}
          </p>
        ) : null}
        {props.footer === undefined ? (
          <DialogFooter className="items-center sm:justify-between">
            <div>
              {props.configured ? (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => void clear()}>
                  {props.pending === 'clear' ? <Loader2 className="animate-spin" /> : null}
                  {props.clearConfirmation?.buttonLabel ??
                    translate('communicationIntegrations.dialog.clear', 'Clear integration')}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => props.onOpenChange(false)}
              >
                {translate('communicationIntegrations.dialog.cancel', 'Cancel')}
              </Button>
              <Button
                type="button"
                disabled={busy || props.saveDisabled}
                onClick={() =>
                  void props
                    .onSave()
                    .then(
                      (saved) => saved && props.closeOnSave !== false && props.onOpenChange(false)
                    )
                }
              >
                {props.pending === 'save' ? <Loader2 className="animate-spin" /> : null}
                {props.pending === 'save'
                  ? (props.savingLabel ??
                    translate('communicationIntegrations.dialog.save', 'Save'))
                  : (props.saveLabel ?? translate('communicationIntegrations.dialog.save', 'Save'))}
              </Button>
            </div>
          </DialogFooter>
        ) : (
          props.footer
        )}
      </DialogContent>
    </Dialog>
  )
}

export function CommunicationIntegrationField(props: {
  id: string
  label: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={props.id}>{props.label}</Label>
        <p className="text-xs text-muted-foreground">{props.description}</p>
      </div>
      {props.children}
    </div>
  )
}

export function CommunicationIntegrationSecretField(props: {
  id: string
  label: string
  description: string
  stored: boolean
  value: string
  cleared: boolean
  disabled: boolean
  allowClear?: boolean
  onValueChange: (value: string) => void
  onClearedChange: (cleared: boolean) => void
}): React.JSX.Element {
  return (
    <CommunicationIntegrationField
      id={props.id}
      label={props.label}
      description={props.description}
    >
      <Input
        id={props.id}
        type="password"
        autoComplete="new-password"
        value={props.value}
        disabled={props.disabled || props.cleared}
        onChange={(event) => props.onValueChange(event.target.value)}
      />
      {props.stored ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {props.cleared
              ? translate(
                  'communicationIntegrations.dialog.secretClearPending',
                  'The saved token will be cleared when you save.'
                )
              : translate(
                  'communicationIntegrations.dialog.secretStored',
                  'A token is stored. Leave this field empty to keep it.'
                )}
          </p>
          {props.allowClear !== false ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={props.disabled}
              onClick={() => props.onClearedChange(!props.cleared)}
            >
              {props.cleared
                ? translate('communicationIntegrations.dialog.undoClear', 'Undo clear')
                : translate(
                    'communicationIntegrations.dialog.clearSavedToken',
                    'Clear saved token'
                  )}
            </Button>
          ) : null}
        </div>
      ) : null}
    </CommunicationIntegrationField>
  )
}

export function getCommunicationSecretMutation(
  value: string,
  cleared: boolean
): CommunicationSecretMutation {
  if (cleared) {
    return { action: 'clear' }
  }
  return value ? { action: 'replace', value } : { action: 'keep' }
}
