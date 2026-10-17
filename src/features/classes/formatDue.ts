export const formatDue = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }) : 'bez terminu'
