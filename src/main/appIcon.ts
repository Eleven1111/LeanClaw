import { join } from 'path'

export function appIconCandidates(appPath: string, bundleDir: string): string[] {
  return [
    join(appPath, 'resources', 'icon.png'),
    join(bundleDir, '..', '..', 'resources', 'icon.png')
  ]
}
