import { getAccessToken } from '../auth/token'

/** Downloads a CSV from the API with the current access token and saves it via a temporary link. */
export async function downloadCsv(path: string, filename: string) {
  const token = await getAccessToken()
  const response = await fetch(`/api/${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
  if (!response.ok) throw new Error('Nie udało się pobrać pliku')
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
