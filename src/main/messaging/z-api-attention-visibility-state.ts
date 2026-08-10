type VisibilityResolver = () => boolean

let resolver: VisibilityResolver | null = null

export function setZApiAttentionVisibilityResolver(next: VisibilityResolver): void {
  resolver = next
}

export function isZApiAttentionManagerVisible(): boolean {
  if (!resolver) {
    throw new Error('z_api_attention_visibility_unavailable')
  }
  return resolver()
}
