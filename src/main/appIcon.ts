import { join } from 'path'

export function appIconCandidates(appPath: string, bundleDir: string, resourcesPath: string): string[] {
  return [
    join(resourcesPath, 'resources', 'icon.png'),
    join(appPath, 'resources', 'icon.png'),
    join(bundleDir, '..', '..', 'resources', 'icon.png')
  ]
}
