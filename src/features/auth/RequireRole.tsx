import { Result } from 'antd'
import type { ReactNode } from 'react'
import { useAuth } from './useAuth'

/** Renders children only for users with the given role (the API enforces it regardless). */
export default function RequireRole({ role, children }: { role: string; children: ReactNode }) {
  const { roles } = useAuth()
  if (!roles.includes(role)) {
    return <Result status="403" title="Brak dostępu" subTitle={`Ta strona wymaga roli „${role}”.`} />
  }
  return children
}
