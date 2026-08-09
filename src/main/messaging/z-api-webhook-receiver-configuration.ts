export type ZApiExpectedWebhookConfiguration = {
  instanceId: string
  configurationId: string
}

export function validateZApiExpectedWebhookConfiguration(
  configuration: ZApiExpectedWebhookConfiguration | null
): void {
  if (
    configuration !== null &&
    (!configuration.instanceId ||
      configuration.instanceId.trim() !== configuration.instanceId ||
      !/^[a-f0-9]{32}$/u.test(configuration.configurationId))
  ) {
    throw new Error('Z-API expected configuration is invalid.')
  }
}
