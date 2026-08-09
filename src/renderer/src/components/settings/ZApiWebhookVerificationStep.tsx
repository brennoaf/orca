import { useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2, Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type {
  ZApiCommunicationIntegrationStatus,
  ZApiListeningValidationSnapshot
} from '../../../../shared/communication-integrations'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { CommunicationIntegrationPendingOperation } from './CommunicationIntegrationDialogFields'

export const NOT_STARTED_Z_API_LISTENING_VALIDATION: ZApiListeningValidationSnapshot = {
  state: 'not_started',
  attemptId: null,
  code: null,
  deadline: null,
  remainingMs: null,
  confirmedAt: null,
  error: null
}

export function canStartZApiListeningValidation(
  status: ZApiCommunicationIntegrationStatus | null
): boolean {
  return Boolean(
    status?.readiness.configured &&
    status.ingressPrepared &&
    status.publicIngressVerified &&
    status.webhooksConfigured
  )
}

function remainingTime(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1_000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function ZApiListeningValidationLaunch(props: {
  pending: CommunicationIntegrationPendingOperation
  onStart: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/50 p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {translate(
            'communicationIntegrations.zApi.listeningValidation.launchTitle',
            'Validate WhatsApp listening'
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {translate(
            'communicationIntegrations.zApi.listeningValidation.launchDescription',
            'Confirm that a real WhatsApp callback reaches Orca before using fast responses.'
          )}
        </p>
      </div>
      <Button type="button" disabled={props.pending !== null} onClick={props.onStart}>
        {props.pending === 'validate' ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {props.pending === 'validate'
          ? translate(
              'communicationIntegrations.zApi.listeningValidation.starting',
              'Starting validation…'
            )
          : translate(
              'communicationIntegrations.zApi.listeningValidation.start',
              'Validate listening'
            )}
      </Button>
    </div>
  )
}

export function ZApiWebhookVerificationStep(props: {
  validation: ZApiListeningValidationSnapshot
  pending: CommunicationIntegrationPendingOperation
  error: string | null
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copyButtonRef = useRef<HTMLButtonElement | null>(null)
  const awaiting = props.validation.state === 'awaiting' ? props.validation : null
  const awaitingAttemptId = awaiting?.attemptId

  useEffect(() => setCopied(false), [awaiting?.code])

  useEffect(() => {
    if (awaitingAttemptId && document.activeElement === document.body) {
      copyButtonRef.current?.focus()
    }
  }, [awaitingAttemptId])

  const copyCode = async (): Promise<void> => {
    if (!awaiting) {
      return
    }
    try {
      await window.api.ui.writeClipboardText(awaiting.code)
      setCopied(true)
    } catch {
      setCopied(false)
      toast.error(
        translate(
          'communicationIntegrations.zApi.listeningValidation.copyFailed',
          'Could not copy the validation code.'
        )
      )
    }
  }

  if (props.pending === 'validate') {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-muted/50 p-4">
        <Loader2 className="animate-spin" aria-hidden />
        <p role="status" aria-live="polite" aria-atomic="true" className="text-sm font-medium">
          {translate(
            'communicationIntegrations.zApi.listeningValidation.starting',
            'Starting validation…'
          )}
        </p>
      </div>
    )
  }

  if (awaiting) {
    const time = remainingTime(awaiting.remainingMs)
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <p role="status" aria-live="polite" aria-atomic="true" className="text-sm font-medium">
            {translate(
              'communicationIntegrations.zApi.listeningValidation.awaitingTitle',
              'Waiting for a WhatsApp message'
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate(
              'communicationIntegrations.zApi.listeningValidation.awaitingDescription',
              'Copy the exact code and send it manually using WhatsApp mobile, web, or desktop. Send it to yourself or ask someone to send it to the number connected to this instance. Any conversation works.'
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate(
              'communicationIntegrations.zApi.listeningValidation.composerWarning',
              "Do not use Orca's fast-response composer for this validation."
            )}
          </p>
        </div>
        <div className="space-y-3 rounded-md border border-border bg-muted/50 p-3">
          <p className="text-xs font-medium">
            {translate(
              'communicationIntegrations.zApi.listeningValidation.codeLabel',
              'Validation code'
            )}
          </p>
          <Button
            ref={copyButtonRef}
            type="button"
            variant="outline"
            className="h-auto w-full justify-between gap-3 py-3 font-mono text-xs whitespace-normal break-all"
            aria-label={translate(
              'communicationIntegrations.zApi.listeningValidation.copyCode',
              'Copy validation code'
            )}
            onClick={() => void copyCode()}
          >
            <span className="text-left">{awaiting.code}</span>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span
              role="timer"
              aria-live="off"
              aria-label={translate(
                'communicationIntegrations.zApi.listeningValidation.timeRemaining',
                'Time remaining: {{time}}',
                { time }
              )}
              className="font-mono tabular-nums"
            >
              {translate(
                'communicationIntegrations.zApi.listeningValidation.remaining',
                '{{time}} remaining',
                { time }
              )}
            </span>
            <span>
              {translate(
                'communicationIntegrations.zApi.listeningValidation.closeHint',
                'You can close this dialog while Orca keeps waiting.'
              )}
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (props.validation.state === 'confirmed') {
    return (
      <div className="space-y-2 rounded-md border border-status-success-border bg-status-success-background p-4 text-status-success">
        <div className="flex items-center gap-2">
          <CheckCircle2 aria-hidden />
          <p role="status" aria-live="polite" aria-atomic="true" className="text-sm font-medium">
            {translate(
              'communicationIntegrations.zApi.listeningValidation.confirmedTitle',
              'WhatsApp listening confirmed'
            )}
          </p>
        </div>
        <p className="text-xs">
          {translate(
            'communicationIntegrations.zApi.listeningValidation.confirmedAt',
            'Confirmed at {{timestamp}}',
            { timestamp: new Date(props.validation.confirmedAt).toLocaleString() }
          )}
        </p>
      </div>
    )
  }

  if (props.validation.state === 'expired') {
    return (
      <div className="space-y-2 rounded-md border border-border bg-muted/50 p-4">
        <p role="status" aria-live="polite" aria-atomic="true" className="text-sm font-medium">
          {translate(
            'communicationIntegrations.zApi.listeningValidation.expiredTitle',
            'Validation code expired'
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {translate(
            'communicationIntegrations.zApi.listeningValidation.expiredDescription',
            'Your Z-API configuration is unchanged. Generate a new code when you are ready.'
          )}
        </p>
      </div>
    )
  }

  const failure = props.validation.state === 'failed' ? props.validation.error.message : props.error
  return (
    <div
      role="alert"
      className="space-y-2 rounded-md border border-destructive/50 bg-destructive/5 p-4"
    >
      <p className="text-sm font-medium text-destructive">
        {translate(
          'communicationIntegrations.zApi.listeningValidation.failedTitle',
          'Listening validation failed'
        )}
      </p>
      {failure ? <p className="text-xs text-destructive">{failure}</p> : null}
    </div>
  )
}

export function ZApiWebhookVerificationFooter(props: {
  validation: ZApiListeningValidationSnapshot
  pending: CommunicationIntegrationPendingOperation
  canStart: boolean
  onStart: () => void
  onCancel: (attemptId: string) => void
  onClose: () => void
  onDone: () => void
}): React.JSX.Element {
  const busy = props.pending !== null
  const awaiting = props.validation.state === 'awaiting' ? props.validation : null

  if (props.validation.state === 'confirmed') {
    return (
      <DialogFooter>
        <Button type="button" onClick={props.onDone}>
          {translate('communicationIntegrations.zApi.listeningValidation.done', 'Done')}
        </Button>
      </DialogFooter>
    )
  }

  return (
    <DialogFooter className="items-center sm:justify-between">
      <div>
        {awaiting ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => props.onCancel(awaiting.attemptId)}
          >
            {props.pending === 'cancel-validation' ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : null}
            {props.pending === 'cancel-validation'
              ? translate(
                  'communicationIntegrations.zApi.listeningValidation.cancelling',
                  'Cancelling…'
                )
              : translate(
                  'communicationIntegrations.zApi.listeningValidation.cancel',
                  'Cancel validation'
                )}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="ghost" disabled={busy} onClick={props.onClose}>
          {translate('communicationIntegrations.zApi.listeningValidation.close', 'Close')}
        </Button>
        {!awaiting ? (
          <Button type="button" disabled={busy || !props.canStart} onClick={props.onStart}>
            {props.pending === 'validate' ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {props.pending === 'validate'
              ? translate(
                  'communicationIntegrations.zApi.listeningValidation.starting',
                  'Starting validation…'
                )
              : props.validation.state === 'expired'
                ? translate(
                    'communicationIntegrations.zApi.listeningValidation.generateNewCode',
                    'Generate a new code'
                  )
                : translate(
                    'communicationIntegrations.zApi.listeningValidation.tryAgain',
                    'Try again'
                  )}
          </Button>
        ) : null}
      </div>
    </DialogFooter>
  )
}
