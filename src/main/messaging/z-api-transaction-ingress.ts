import { randomBytes } from 'node:crypto'
import type { ZApiTransactionConfiguration } from './z-api-transaction-journal'
import {
  ZApiTransactionError,
  zApiFullWebhookUrl,
  type ZApiPreparedIngress,
  type ZApiReceiverController,
  type ZApiReceiverEndpoint,
  type ZApiTransactionServiceDependencies,
  type ZApiTransactionStatus
} from './z-api-transaction-contract'

type RuntimeIngress = {
  requestedPort: number
  path: string
  endpoint: ZApiReceiverEndpoint
  receiver: ZApiReceiverController
}

export class ZApiTransactionIngress {
  private ingress: RuntimeIngress | null = null

  constructor(private readonly dependencies: ZApiTransactionServiceDependencies) {}

  async prepare(
    requestedPort: number,
    status: ZApiTransactionStatus
  ): Promise<ZApiPreparedIngress> {
    if (!Number.isSafeInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
      throw new ZApiTransactionError('invalid_configuration', 'Webhook port is invalid.')
    }
    if (this.ingress) {
      if (this.ingress.requestedPort !== requestedPort) {
        throw new ZApiTransactionError(
          'receiver_unavailable',
          'A webhook receiver is already using another port.'
        )
      }
      return this.publicIngress(this.ingress)
    }
    const persisted = this.dependencies.journal.read()
    const path =
      persisted.active?.configuration.secretPath ??
      persisted.pending?.configuration.secretPath ??
      (
        this.dependencies.randomPath ??
        (() => `/orca/z-api/${randomBytes(24).toString('base64url')}`)
      )()
    const receiver = this.dependencies.createReceiver({ port: requestedPort, path })
    try {
      const endpoint = await receiver.start()
      this.ingress = { requestedPort, path, endpoint, receiver }
      status.ingress.prepared = true
      status.ingress.listenPort = endpoint.port
      return this.publicIngress(this.ingress)
    } catch {
      status.lastErrorCode = 'receiver_unavailable'
      throw new ZApiTransactionError('receiver_unavailable', 'Webhook receiver is unavailable.')
    }
  }

  async stop(status: ZApiTransactionStatus): Promise<void> {
    const ingress = this.ingress
    if (!ingress) {
      return
    }
    await ingress.receiver.stop()
    this.ingress = null
    status.ingress = {
      prepared: false,
      listenPort: null,
      challengeVerified: false,
      webhooksVerified: false
    }
    status.verified = false
    status.sendReady = false
    status.receiveReady = false
  }

  require(listenPort: number): RuntimeIngress {
    const ingress = this.ingress
    if (!ingress || ingress.endpoint.port !== listenPort) {
      throw new ZApiTransactionError(
        'receiver_unavailable',
        'Prepare the webhook receiver before configuring Z-API.'
      )
    }
    return ingress
  }

  async challenge(
    configuration: ZApiTransactionConfiguration,
    status: ZApiTransactionStatus
  ): Promise<void> {
    const ingress = this.require(configuration.listenPort)
    const nonce = (this.dependencies.randomNonce ?? (() => randomBytes(24).toString('base64url')))()
    ingress.receiver.armChallenge(nonce)
    try {
      await this.dependencies.verifyChallenge({
        publicWebhookUrl: zApiFullWebhookUrl(configuration),
        nonce
      })
      status.ingress.challengeVerified = true
    } catch {
      status.ingress.challengeVerified = false
      throw new ZApiTransactionError(
        'webhook_challenge_failed',
        'The public webhook challenge failed.'
      )
    }
  }

  async ensureActive(
    configuration: ZApiTransactionConfiguration,
    status: ZApiTransactionStatus
  ): Promise<ZApiReceiverController> {
    if (this.ingress) {
      if (
        this.ingress.endpoint.port !== configuration.listenPort ||
        this.ingress.path !== configuration.secretPath
      ) {
        throw new ZApiTransactionError(
          'receiver_unavailable',
          'The active webhook receiver conflicts with persisted state.'
        )
      }
      return this.ingress.receiver
    }
    const receiver = this.dependencies.createReceiver({
      port: configuration.listenPort,
      path: configuration.secretPath
    })
    try {
      const endpoint = await receiver.start()
      this.ingress = {
        requestedPort: configuration.listenPort,
        path: configuration.secretPath,
        endpoint,
        receiver
      }
      status.ingress.prepared = true
      status.ingress.listenPort = endpoint.port
      return receiver
    } catch {
      throw new ZApiTransactionError('receiver_unavailable', 'Webhook receiver is unavailable.')
    }
  }

  path(): string {
    const ingress = this.ingress
    if (!ingress) {
      throw new ZApiTransactionError('receiver_unavailable', 'Webhook receiver is unavailable.')
    }
    return ingress.path
  }

  private publicIngress(ingress: RuntimeIngress): ZApiPreparedIngress {
    return {
      listenPort: ingress.endpoint.port,
      localTunnelTarget: `http://127.0.0.1:${ingress.endpoint.port}`
    }
  }
}
