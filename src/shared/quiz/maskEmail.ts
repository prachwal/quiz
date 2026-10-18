/** `ala.kowalska@szkola.pl` -> `al***@szkola.pl`: enough to tell two people apart, not enough to harvest addresses. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  const local = email.slice(0, at)
  return `${local.slice(0, Math.min(2, Math.max(1, local.length - 1)))}***${email.slice(at)}`
}
