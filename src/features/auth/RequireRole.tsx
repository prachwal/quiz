import { Result } from 'antd'
import type { ReactNode } from 'react'
import { useAuth } from './useAuth'

/** Renders children only for users with (any of) the given role(s) (the API enforces it regardless). */
export default function RequireRole({ role, children }: { role: string | string[]; children: ReactNode }) {
  const { roles } = useAuth()
  const allowed = Array.isArray(role) ? role : [role]
  if (!allowed.some((r) => roles.includes(r))) {
    return <Result status="403" title="Brak dostępu" subTitle={`Ta strona wymaga roli: ${allowed.join(' lub ')}.`} />
  }
  return children
}
