function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isAbsoluteTaskPath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)
}

const POSIX_PATH_OR_URL =
  /https?:\/\/[^\s"'<>，。；：（）()[\]{}]+|\/[^"'<>|，。；：（）()[\]{}\n\r]+/g
const WINDOWS_ABSOLUTE_PATH =
  /\b[A-Za-z]:[\\/][^"'<>|，。；：（）()[\]{}\n\r]+/g

function collapseAbsolutePath(path: string, separator: '/' | '\\'): string {
  const trimmed = path.trimEnd()
  const trailing = path.slice(trimmed.length)
  const parts = trimmed.split(/[\\/]/).filter(Boolean)
  return parts.length > 0 ? `…${separator}${parts.at(-1)}${trailing}` : `…${trailing}`
}

export function redactTaskPrivatePaths<T extends string | null | undefined>(
  value: T,
  inputPath: string
): T {
  if (typeof value !== 'string') return value
  let redacted: string = value
  if (isAbsoluteTaskPath(inputPath)) {
    const slashIndex = Math.max(inputPath.lastIndexOf('/'), inputPath.lastIndexOf('\\'))
    if (slashIndex > 0) {
      const directory = inputPath.slice(0, slashIndex)
      const separator = inputPath[slashIndex]
      redacted = redacted.replace(
        new RegExp(`${escapeRegExp(directory)}[\\\\/]`, 'gi'),
        `…${separator}`
      )
    }
  }
  redacted = redacted.replace(POSIX_PATH_OR_URL, (match, offset: number, source: string) => {
    if (match.startsWith('http://') || match.startsWith('https://')) return match
    const preceding = offset > 0 ? source[offset - 1] : ''
    if (preceding && /[\p{L}\p{N}._…/]/u.test(preceding)) return match
    return collapseAbsolutePath(match, '/')
  })
  redacted = redacted.replace(WINDOWS_ABSOLUTE_PATH, (match) =>
    collapseAbsolutePath(match, '\\')
  )
  return redacted as T
}

const SAFE_RUN_EVENT_KEYS: Readonly<Record<string, readonly string[]>> = {
  'task-created': [
    'recipeId',
    'budgetUsd',
    'projectId',
    'hasProjectInstructions',
    'agentId',
    'hasAgentInstructions',
    'scheduleId',
    'scheduleTriggerSource'
  ],
  'run-started': ['recipe'],
  'budget-updated': ['budgetUsd'],
  'retry-from-checkpoint': ['resumeIdx'],
  'step-started': ['name', 'idx'],
  'step-completed': ['name'],
  'step-error': ['name', 'attempt', 'retryable'],
  'approval-requested': ['toolId'],
  'approval-resolved': ['decision'],
  'andon-opened': ['andonId', 'category'],
  'andon-resolved': ['action'],
  'budget-warning': ['after', 'budget'],
  'budget-exhausted': ['before', 'budget'],
  'model-fallback': ['tier', 'from', 'to'],
  verification: ['kind', 'status'],
  'verification-blocked': ['resumeStepIndex'],
  delivered: ['artifactId'],
  'events-archived': ['count'],
  'tool-call': ['toolId'],
  'model-call': ['model', 'tokensOut'],
  'artifact-created': ['type', 'version'],
  'status-changed': ['from', 'to'],
  'recovered-after-restart': ['from', 'to'],
  'tool-forbidden': ['toolId']
}

function isSafeRunEventValue(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length <= 160)
  )
}

export function projectSafeRunEventPayload(
  type: string,
  payload: string | null
): string | null {
  const keys = SAFE_RUN_EVENT_KEYS[type]
  if (!keys || !payload) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const source = parsed as Record<string, unknown>
  const projected: Record<string, string | number | boolean | null> = {}
  for (const key of keys) {
    const value = source[key]
    if (isSafeRunEventValue(value)) projected[key] = value
  }
  return Object.keys(projected).length > 0 ? JSON.stringify(projected) : null
}
