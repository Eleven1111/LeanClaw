export interface VersionIdentity {
  id: string
  version: number
}

export function orderVersions<T extends VersionIdentity>(versions: readonly T[]): T[] {
  return [...versions].sort((left, right) => left.version - right.version)
}

export function defaultVersionPair(
  versions: readonly VersionIdentity[]
): { beforeId: string; afterId: string } | null {
  const ordered = orderVersions(versions)
  if (ordered.length < 2) return null
  return {
    beforeId: ordered[ordered.length - 2].id,
    afterId: ordered[ordered.length - 1].id
  }
}
