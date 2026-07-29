import {
  cleanupTestEnvironment,
  installTestEnvironment
} from './test-environment'

export default function setup(): () => void {
  const installed = installTestEnvironment('vitest')
  return () => cleanupTestEnvironment(installed)
}
