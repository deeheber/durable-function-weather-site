const CURRENT_VERSION_KEY_RE = /(.*CurrentVersion[A-F0-9]{8})[a-f0-9]+/
const CURRENT_VERSION_VALUE_RE =
  /(.*CurrentVersion[A-F0-9]{8})[a-f0-9]+/g

export function sanitizeAssetHashes(obj: unknown): unknown {
  if (typeof obj === 'string') {
    if (/^[a-f0-9]{64}\.zip$/.test(obj)) return '[ASSET_HASH].zip'
    return obj.replace(CURRENT_VERSION_VALUE_RE, '$1[HASH]')
  }
  if (Array.isArray(obj)) return obj.map(sanitizeAssetHashes)
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => {
        const sanitizedKey = k.replace(CURRENT_VERSION_KEY_RE, '$1[HASH]')
        return [sanitizedKey, sanitizeAssetHashes(v)]
      }),
    )
  }
  return obj
}
