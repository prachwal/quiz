import { assertRemoteDbAllowed } from './guard'

export default function globalSetup(): void {
  assertRemoteDbAllowed()
}
