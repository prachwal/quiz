import { useEffect } from 'react'
import { useGetProgressQuery, useUpdateProfileMutation } from '../../app/api'

/** Days (and so streaks) are counted in the device's time zone: keep the profile in sync with it. */
export function useTimezoneSync() {
  const { data } = useGetProgressQuery()
  const [update] = useUpdateProfileMutation()
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (data && zone && data.timezone !== zone) void update({ timezone: zone })
  }, [data, update])
}
