import { existsSync, realpathSync } from 'fs'
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from 'path'

interface TestEnvironment {
  LEANCLAW_TEST_ROOT?: string
  LEANCLAW_DATA_DIR?: string
  HOME?: string
  TMPDIR?: string
}

function canonicalPath(path: string): string {
  let cursor = resolve(path)
  const missing: string[] = []

  while (!existsSync(cursor)) {
    const parent = dirname(cursor)
    if (parent === cursor) break
    missing.unshift(basename(cursor))
    cursor = parent
  }

  const existing = existsSync(cursor) ? realpathSync.native(cursor) : cursor
  return resolve(existing, ...missing)
}

function isWithin(candidate: string, root: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

export function isPathAllowed(
  path: string,
  allowedDirs: string[],
  env: TestEnvironment = process.env
): boolean {
  if (!path || allowedDirs.length === 0) return false
  const candidate = canonicalPath(path)
  const allowed = allowedDirs.some((dir) => isWithin(candidate, canonicalPath(dir)))
  if (!allowed) return false

  const testRoot = env.LEANCLAW_TEST_ROOT
  return !testRoot || isWithin(candidate, canonicalPath(testRoot))
}

export function assertPathWithinTestRoot(
  path: string,
  label: string,
  env: TestEnvironment = process.env
): void {
  const root = env.LEANCLAW_TEST_ROOT
  if (!root) return
  if (!isWithin(canonicalPath(path), canonicalPath(root))) {
    throw new Error(`${label} 必须位于 LEANCLAW_TEST_ROOT 内`)
  }
}

export function assertTestIsolationEnvironment(
  env: TestEnvironment = process.env
): void {
  const root = env.LEANCLAW_TEST_ROOT
  if (!root) return

  const resolvedRoot = canonicalPath(root)
  if (resolvedRoot === parse(resolvedRoot).root) {
    throw new Error('LEANCLAW_TEST_ROOT 不能是文件系统根目录')
  }

  for (const [label, path] of [
    ['LEANCLAW_DATA_DIR', env.LEANCLAW_DATA_DIR],
    ['HOME', env.HOME],
    ['TMPDIR', env.TMPDIR]
  ] as const) {
    if (!path) throw new Error(`测试隔离缺少 ${label}`)
    if (!isWithin(canonicalPath(path), resolvedRoot)) {
      throw new Error(`${label} 必须位于 LEANCLAW_TEST_ROOT 内`)
    }
  }
}
