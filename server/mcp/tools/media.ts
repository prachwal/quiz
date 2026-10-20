import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { MEDIA_CONTENT_TYPES } from '../../media/constants'
import { FETCH_TIMEOUT_MS, fetchImage, FetchImageError } from '../../media/fetchImage'
import { nodeFetchDeps } from '../../media/nodeTransport'
import { urlFetchEnabled } from '../../media/config'
import type { MediaRow } from '../../media/repo'
import * as repo from '../../media/repo'
import {
  beginUpload,
  completeUpload,
  deleteMedia,
  mediaDetails,
  MediaRequestError,
  mediaRuntime,
  type MediaRuntime,
  storeBytes,
  urlFetchesLastHour,
  urlOf,
} from '../../media/service'
import { checkImageUrl } from '../../media/ssrf'
import { decodeBase64Image, mediaMarkdown, URL_FETCH_DISABLED_REASON, URL_FETCH_LIMIT_REASON, urlFetchAllowed, validateAlt } from '../../media/uploads'
import { quizTitles } from '../../quizRepo'
import { audit, failure, needQuizWrite, text } from '../context'
import type { Ctx } from '../context'

/** base64 of 2 MB is about 2.8 million characters; the limit is what the request can carry, MEDIA_MAX_BYTES is checked after decoding. */
const MAX_BASE64_CHARS = 2_800_000

const mediaId = z.string().uuid().describe('Id pliku (UUID) z media_upload, media_list albo media_get')
const alt = z
  .string()
  .min(1)
  .max(200)
  .describe('Opis obrazka po polsku (1-200 znaków, bez "]" i znaków nowej linii). Wymagany: jest częścią zapisu ![opis](media:…) i wymaga go quiz_schema')
const sha256 = z.string().regex(/^[0-9a-f]{64}$/).describe('SHA-256 bajtów pliku, 64 znaki szesnastkowe małymi literami')

/** Runs a media action; a refusal (MediaRequestError) becomes a plain tool error with its Polish message. */
async function run(work: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof MediaRequestError) return failure(error.message)
    throw error
  }
}

/** Audit details never contain the bytes, only the size, the source and a short hash. */
const detailsOf = (row: MediaRow) => ({ sizeBytes: row.sizeBytes, source: row.source, sha256: row.sha256.slice(0, 12) })

const uploadAnswer = (runtime: MediaRuntime, row: MediaRow, altText: string, reused: boolean) => ({
  mediaId: row.id,
  url: urlOf(runtime, row),
  width: row.width,
  height: row.height,
  size: row.sizeBytes,
  markdown: mediaMarkdown(altText, row.id),
  reused,
})

const fileInfo = (runtime: MediaRuntime, row: MediaRow) => ({
  mediaId: row.id,
  url: urlOf(runtime, row),
  width: row.width,
  height: row.height,
  size: row.sizeBytes,
  contentType: row.contentType,
  status: row.status,
  source: row.source,
  ownerId: row.ownerId,
  createdAt: row.createdAt,
  readyAt: row.readyAt,
})

/** media_* tools (Media-Storage-Plan M5): upload, check, list, read and delete images. Every change is audited. */
export function registerMediaTools(server: McpServer, ctx: Ctx) {
  server.registerTool(
    'media_upload',
    {
      title: 'Wyślij obraz (base64)',
      description:
        'Zapisuje obraz PNG, JPEG albo WebP przekazany w wywołaniu jako base64 i zwraca mediaId, url, wymiary i gotowy zapis markdown "![opis](media:…)" do wklejenia w treść pytania, wyjaśnienia albo opcji. Składnię obrazów i miejsca, gdzie wolno je umieścić, sprawdź w quiz_schema (źródło prawdy, nie ten opis). UWAGA na koszt: każdy znak base64 to tokeny, więc obraz rzędu 100 KB to dziesiątki tysięcy tokenów - używaj tego tylko do małych ilustracji. Większe obrazy: media_upload_from_url (zalecane, gdy obraz ma adres https) albo media_create_upload. Typ pliku wyznacza zawartość, nie nazwa ani deklaracja; GIF i SVG są odrzucane. Ten sam plik tego autora zwraca istniejący wpis (reused: true). Limit: 2 MB po zdekodowaniu.',
      inputSchema: {
        dataBase64: z.string().min(1).max(MAX_BASE64_CHARS).describe('Zawartość pliku w base64 (bez nagłówka data:, ale nagłówek zostanie pominięty, jeśli go podasz)'),
        alt,
      },
    },
    async ({ dataBase64, alt: altInput }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      return run(async () => {
        const altChecked = validateAlt(altInput)
        if (!altChecked.ok) return failure(altChecked.reason)
        const runtime = mediaRuntime()
        const decoded = decodeBase64Image(dataBase64, runtime.config.maxBytes)
        if (!decoded.ok) return failure(decoded.reason)
        const stored = await storeBytes(runtime, { ownerId: ctx.userId, bytes: decoded.value, source: 'mcp-base64' })
        if (!stored.reused) await audit(ctx, 'media_upload', { id: stored.row.id, label: 'obraz' }, detailsOf(stored.row))
        return text(uploadAnswer(runtime, stored.row, altChecked.value, stored.reused))
      })
    },
  )

  server.registerTool(
    'media_upload_from_url',
    {
      title: 'Pobierz obraz z adresu',
      description:
        'Serwer pobiera obraz z podanego adresu https (port 443, bez loginu, bez adresów lokalnych i prywatnych, przekierowania najwyżej 3 i każde sprawdzane osobno, limit 8 s i 2 MB) i zapisuje go; zwraca mediaId i markdown "![opis](media:…)" tak jak media_upload. Najlepsza ścieżka dla obrazów z własnego hostingu albo z sieci - model nie wypisuje danych. Limit: 20 udanych pobrań na godzinę. Wyłączone, dopóki administrator nie włączy MEDIA_URL_FETCH na serwerze. Składnię sprawdź w quiz_schema.',
      inputSchema: {
        url: z.string().min(1).max(2048).describe('Pełny adres https obrazu (PNG, JPEG albo WebP)'),
        alt,
      },
    },
    async ({ url, alt: altInput }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      return run(async () => {
        if (!urlFetchEnabled(process.env)) return failure(URL_FETCH_DISABLED_REASON)
        const altChecked = validateAlt(altInput)
        if (!altChecked.ok) return failure(altChecked.reason)
        const runtime = mediaRuntime()
        if (!urlFetchAllowed(await urlFetchesLastHour(ctx.userId, runtime.now()))) return failure(URL_FETCH_LIMIT_REASON)
        const checked = checkImageUrl(url)
        if (!checked.ok) return failure(`Adres odrzucony: ${checked.reason}`)
        let fetched: Awaited<ReturnType<typeof fetchImage>>
        try {
          fetched = await fetchImage(url, nodeFetchDeps, { maxBytes: runtime.config.maxBytes, timeoutMs: FETCH_TIMEOUT_MS })
        } catch (error) {
          if (error instanceof FetchImageError) return failure(error.message)
          throw error
        }
        const stored = await storeBytes(runtime, { ownerId: ctx.userId, bytes: fetched.bytes, source: 'mcp-url' })
        if (!stored.reused) await audit(ctx, 'media_upload_from_url', { id: stored.row.id, label: 'obraz' }, detailsOf(stored.row))
        return text({ ...uploadAnswer(runtime, stored.row, altChecked.value, stored.reused), from: fetched.finalUrl })
      })
    },
  )

  server.registerTool(
    'media_create_upload',
    {
      title: 'Przygotuj wysyłkę obrazu (PUT)',
      description:
        'Dla klientów, które umieją wysłać plik żądaniem HTTP PUT: zwraca mediaId, uploadUrl i nagłówki (headers) podpisane na konkretny rozmiar. Wyślij bajty pliku PUT-em na uploadUrl z dokładnie tymi nagłówkami, a potem wywołaj media_complete z mediaId - dopiero wtedy obraz jest gotowy. Podaj contentType, size i sha256 zgodne z plikiem; zły rozmiar, typ albo skrót odrzuci media_complete. Gdy plik już istnieje (ten sam skrót), zwraca go od razu z reused: true. Składnię sprawdź w quiz_schema.',
      inputSchema: {
        contentType: z.enum(MEDIA_CONTENT_TYPES).describe('Typ pliku: image/png, image/jpeg albo image/webp'),
        size: z.number().int().min(1).describe('Rozmiar pliku w bajtach (maks. MEDIA_MAX_BYTES, domyślnie 2 MB)'),
        sha256,
        alt,
      },
    },
    async ({ contentType, size, sha256: hash, alt: altInput }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      return run(async () => {
        const altChecked = validateAlt(altInput)
        if (!altChecked.ok) return failure(altChecked.reason)
        const runtime = mediaRuntime()
        const started = await beginUpload(runtime, { ownerId: ctx.userId, contentType, size, sha256: hash, source: 'mcp-presigned' })
        if (started.kind === 'reused') return text(uploadAnswer(runtime, started.row, altChecked.value, true))
        if (started.created) await audit(ctx, 'media_create_upload', { id: started.row.id, label: 'obraz' }, detailsOf(started.row))
        return text({
          mediaId: started.row.id,
          uploadUrl: started.uploadUrl,
          headers: started.headers,
          expiresInSeconds: started.expiresInSeconds,
          markdown: mediaMarkdown(altChecked.value, started.row.id),
          reused: false,
          next: 'PUT bajty pliku na uploadUrl z podanymi headers (bez zmian), potem wywołaj media_complete z mediaId.',
        })
      })
    },
  )

  server.registerTool(
    'media_complete',
    {
      title: 'Zakończ wysyłkę obrazu',
      description:
        'Po PUT na uploadUrl (z media_create_upload): sprawdza w magazynie rozmiar, skrót i typ zgodne z zadeklarowanymi i ustawia plik jako gotowy. Gdy coś się nie zgadza, plik i wpis są usuwane, a narzędzie zwraca powód - zacznij od media_create_upload. Tylko właściciel pliku (albo admin).',
      inputSchema: { mediaId },
    },
    async ({ mediaId: id }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      return run(async () => {
        const runtime = mediaRuntime()
        const completion = await completeUpload(runtime, { id, userId: ctx.userId, isAdmin: ctx.viewer.admin })
        if (completion.kind === 'rejected') {
          await audit(ctx, 'media_complete', { id, label: 'obraz' }, { outcome: 'rejected', reason: completion.reason })
          return failure(completion.reason)
        }
        await audit(ctx, 'media_complete', { id, label: 'obraz' }, { outcome: 'ready', ...detailsOf(completion.row) })
        return text(fileInfo(runtime, completion.row))
      })
    },
  )

  server.registerTool(
    'media_list',
    {
      title: 'Lista plików',
      description:
        'Pliki autora (admin widzi wszystkie i może wybrać ownerId), od najnowszego. unreferenced=true zwraca tylko pliki, których nie używa żaden quiz. limit (domyślnie 25, maks. 200) i offset do stronicowania; total i hasMore mówią, czy są kolejne.',
      inputSchema: {
        unreferenced: z.boolean().default(false),
        limit: z.number().int().min(1).max(200).default(25),
        offset: z.number().int().min(0).default(0),
        ownerId: z.string().min(1).max(200).optional().describe('Tylko admin: id właściciela (Auth0 sub)'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ unreferenced, limit, offset, ownerId }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      return run(async () => {
        if (ownerId !== undefined && !ctx.viewer.admin) return failure('Filtr ownerId może użyć tylko admin. Zwykły autor widzi swoje pliki.')
        const runtime = mediaRuntime()
        const scope = ctx.viewer.admin ? (ownerId ?? null) : ctx.userId
        const page = await repo.listByOwner({ ownerId: scope, unreferenced, limit, offset })
        return text({
          total: page.total,
          hasMore: offset + page.items.length < page.total,
          items: page.items.map((row) => fileInfo(runtime, row)),
        })
      })
    },
  )

  server.registerTool(
    'media_get',
    {
      title: 'Szczegóły pliku',
      description: 'Metadane pliku, adres url i lista referencedBy (quizy, które go używają, z tytułami). Tylko właściciel albo admin.',
      inputSchema: { mediaId },
      annotations: { readOnlyHint: true },
    },
    async ({ mediaId: id }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      return run(async () => {
        const runtime = mediaRuntime()
        const { row, references } = await mediaDetails({ id, userId: ctx.userId, isAdmin: ctx.viewer.admin })
        const titles = await quizTitles(references.filter((r) => r.ownerKind === 'quiz').map((r) => r.ownerId))
        return text({
          ...fileInfo(runtime, row),
          sha256: row.sha256,
          referencedBy: references.map((r) => ({ kind: r.ownerKind, id: r.ownerId, title: titles.get(r.ownerId) ?? null })),
        })
      })
    },
  )

  server.registerTool(
    'media_delete',
    {
      title: 'Usuń plik',
      description:
        'Trwale usuwa plik z magazynu i z bazy. Odmawia, dopóki plik jest używany w quizie (zwraca nazwy tych quizów) - najpierw usuń go z treści (quiz_update) albo usuń quiz. Wymaga confirm=true. Tylko właściciel albo admin.',
      inputSchema: { mediaId, confirm: z.literal(true).describe('Musi być true') },
      annotations: { destructiveHint: true },
    },
    async ({ mediaId: id }) => {
      if (!ctx.canWriteQuizzes) return needQuizWrite()
      return run(async () => {
        const result = await deleteMedia(mediaRuntime(), { id, userId: ctx.userId, isAdmin: ctx.viewer.admin })
        if (result.kind === 'in-use') {
          const titles = await quizTitles(result.references.filter((r) => r.ownerKind === 'quiz').map((r) => r.ownerId))
          const names = result.references.map((r) => (r.ownerKind === 'quiz' ? `quiz „${titles.get(r.ownerId) ?? r.ownerId}”` : `${r.ownerKind} ${r.ownerId}`))
          return failure(`Obraz jest używany w: ${names.join(', ')}. Najpierw usuń go z tych treści (quiz_update) albo usuń te quizy, a potem wywołaj media_delete ponownie.`)
        }
        await audit(ctx, 'media_delete', { id, label: 'obraz' }, detailsOf(result.row))
        return text({ ok: true, mediaId: id })
      })
    },
  )
}
