---
tags:
  - media
  - mcp
  - backend
  - frontend
  - database
  - security
  - plan
  - status/todo
created: 2026-10-19
updated: 2026-10-20
---

# Magazyn obrazów w S3 — plan wykonawczy

> Obrazki w quizach i lekcjach: przechowywanie w magazynie zgodnym z S3, wysyłanie przez przeglądarkę **i przez MCP**, wstawianie do treści jednym prostym zapisem i bezpieczne renderowanie. Doprecyzowuje sekcję „Moduł media (S3)” z [[Learning-Slice-Plan]] i zastępuje w niej projekt kolumn `image_id` zapisem w treści (patrz D2). Stan (2026-10-20): **M1–M6 zrobione w kodzie** (M1 zastosowane na bazie; zapis `![opis](media:<uuid>)`, walidacja, `media_refs`, mapa `media` w odpowiedziach, renderowanie, MCP, wysyłanie w edytorze); **M0 czeka na właściciela** (runbook niżej); D10 zmierzone, wybrany własny SigV4.

## Cele

1. Autor (człowiek w edytorze albo model przez MCP) może **dodać obraz** i dostać gotowy zapis do wklejenia w treść.
2. Obraz można **umieścić w treści** pytania, wyjaśnienia, opcji wyboru i wstępu lekcji oraz jako ilustrację czasownika.
3. Quiz i lekcja **renderują obraz bezpiecznie** — bez HTML, bez dowolnych adresów z internetu.
4. Magazyn jest **wymienny** (Neon Object Storage, AWS S3, R2) przez zmienne środowiskowe.
5. Nic nie psuje istniejących quizów, kontraktu `quiz_create`/`quiz_update` ani oceny.

## Poza zakresem

Wideo i audio, galeria do ponownego użycia dla uczniów, przetwarzanie obrazów po stronie serwera (przycinanie, miniatury), SVG (wektory mogą zawierać skrypty), edycja obrazów przez model, przesyłanie obrazów przez uczniów.

## Decyzje projektowe

| # | Decyzja | Wybór | Uzasadnienie |
| --- | --- | --- | --- |
| D1 | Kto może wysyłać i usuwać | uprawnienie `write:quizzes` (to samo co tworzenie quizów) | jeden model uprawnień; token osobisty z `write:quizzes` też działa, więc klient MCP z tokenem wysyła obrazy bez OAuth |
| D2 | Jak obraz trafia do treści | **zapis w treści**: `![opis](media:<uuid>)`, bez zmian struktury quizu | `prompt`/`explanation` to już zwykłe ciągi; `quiz_schema` i `quiz_create` nie zmieniają kształtu; autor MCP potrzebuje tylko jednego zapisu |
| D3 | Odczyt obrazów | bucket **`public_read`**, klucze losowe (uuid v4) | `<img>` nie wysyła nagłówka `Authorization` (SPA używa Bearer), więc prywatny bucket wymagałby serwera pośredniczącego i kosztu każdego obrazu |
| D4 | Obce adresy `https://…` w treści | **odrzucane** przy zapisie; trzeba najpierw wysłać obraz do magazynu | prywatność uczniów (obcy serwer widzi, kto ogląda quiz), znikające linki, śledzące piksele |
| D5 | Tekst alternatywny | **wymagany** w pytaniach i wyjaśnieniach (1–200 znaków), dozwolony pusty tylko dla ilustracji czasownika; egzekwowany w `validate` pola (jak reguły `cloze`), a w `quiz.schema.json` wyrażony wzorcem z negatywnym lookahead (`^(?![\s\S]*!\[\]\(media:)[\s\S]*$`) | obraz niesie treść; parser dopuszcza `{0,200}`, więc bez tej reguły pusty opis przejdzie. Schemat JSON nie sprawdzi istnienia `mediaId` ani reguł „gdzie wolno” — ta luka w parytecie zod ↔ JSON Schema jest znana i opisana w teście |
| D6 | Jak klient dostaje adresy | **mapa `media`** w odpowiedzi (`{ id: { url, width, height } }`), treść zostaje niezmieniona | zapis `media:<uuid>` jest stabilny przy zmianie hosta; wymiary pozwalają zarezerwować miejsce (bez skoku układu) |
| D7 | Dostawca magazynu | po spike'u M0; kod zna tylko S3 | dokumentacja Neon Object Storage ma niewiadome (patrz niżej) |
| D8 | Typy plików | PNG, JPEG, WebP; GIF i SVG **nie** (SVG może zawierać skrypty, animowany GIF jest ciężki) | rozpoznawanie po pierwszych bajtach, nie po deklarowanym typie |
| D9 | Limit rozmiaru | 2 MB na plik (`MEDIA_MAX_BYTES`) | limit żądania funkcji Vercela to około 4,5 MB, a base64 powiększa dane o jedną trzecią |
| D10 | Klient S3 | w M0 zmierzyć, ile `@aws-sdk/client-s3` dodaje do `api/index.mjs` (obecnie `build:api` wyłącza z paczki tylko `pg-native` i `@sentry/node`) i do zimnego startu; domyślnie SDK, a **własny SigV4** (`node:crypto`, około 80 linii, testy na wektorach AWS) jeśli przyrost jest zauważalny | pakiet nie jest dziś zależnością; decyzja przed M1, nie w trakcie | **Wynik pomiaru (2026-10-20, bez M0):** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` dodają do bundla (`build:api` bez minifikacji) **1 501 451 B** (pomiar: bundle z SDK 1 501 708 B minus bundle pusty 257 B; bieżący `api/index.mjs` ma 3 192 116 B), a zminifikowane **578 111 B** (gzip 170 021 B), czyli powyżej progu 300 KB. **Wybrano własny SigV4** (`server/media/sigv4.ts` na `node:crypto` i `fetch`); SDK nie jest zależnością.
| D11 | Audyt wysyłek | każde wysłanie i usunięcie trafia do `admin_audit_log` niezależnie od źródła (`browser` jako akcja `media.upload`, MCP jako `mcp.call`) | „kto dodał ten obraz” ma odpowiedź w obu kanałach |

## Architektura

```
server/media/                  (po kroku 6 podziału nauki: server/modules/media)
  driver.ts                    StorageDriver: presignPut, put, head, remove, publicUrl
  s3Driver.ts                  klient S3 (SDK albo własny SigV4 — decyzja D10), path-style
  memoryDriver.ts              atrapa do testów i test:mcp
  sniff.ts                     rozpoznanie typu i wymiarów po pierwszych bajtach (czysta)
  ssrf.ts                      klasyfikacja adresów IP i bezpieczne pobieranie URL
  repo.ts                      tabela media, media_refs, limity dzienne
  routes.ts                    /api/media (przeglądarka)
  tools.ts                     narzędzia MCP media_*
src/shared/media/
  richText.ts                  parser zapisu obrazu (czysty), extractMediaIds, stripImages
  types.ts                     MediaInfo { url, width, height }
src/features/media/
  MediaContext.tsx             mapa media dla poddrzewa (gracz, wynik, lekcja)
  RichText.tsx                 tekst + obrazy, bez HTML
  MediaImage.tsx               <img> z rezerwacją miejsca
  ImageUpload.tsx              wybór, zmniejszenie, wysyłka, wstawienie zapisu
```

`media` nie importuje nic z quizów, nauki, powtórek ani klas. Quizy i nauka wołają tylko jego publiczne funkcje (`syncRefs`, `resolve`). Zależność `quizzes → media` i `learning → media` jest dozwolona.

### Zapis obrazu w treści

Jedyna składnia: `![opis](media:<uuid>)`, w jednym wierszu.

- Parser jest czysty (`src/shared/media/richText.ts`) i **nie** jest pełnym Markdownem: nie ma pogrubień, linków ani HTML. `parseRichText(text) → ({type:'text',text} | {type:'image',alt,mediaId})[]`.
- Wyrażenie: `/!\[([^\]\n]{0,200})\]\(media:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/g`.
- Granice: najwyżej 3 obrazy w jednym polu i 100 odwołań w quizie lub lekcji.
- Współpraca z `cloze`: znaczniki `{{n}}` są szukane **w segmentach tekstowych** po wydzieleniu obrazów, więc oba zapisy mogą występować w jednej treści.
- Widoki tekstowe (listy podejść, analizy, MCP): `promptText` zamienia obraz na `[obraz: opis]`, bez adresu.

### Gdzie obraz może wystąpić

| Pole | Obraz w treści | Uwagi |
| --- | --- | --- |
| `questions.prompt` | tak | w tym `cloze`, jeśli numerów luk nie dotyka |
| `questions.explanation` | tak | pokazywane w wyniku |
| `options.text` typów `single`, `multiple`, `truefalse` | tak — opcja z samym obrazem staje się kafelkiem z obrazem | ocena po id opcji, więc treść opcji jej nie zmienia |
| `options.text` typu `text` | **nie** | to akceptowane odpowiedzi porównywane tekstem |
| pary `matching`, elementy `ordering` | **nie** (na razie) | porównanie po tekście |
| `lessons.intro` | tak | kolumna `NOT NULL DEFAULT ''`; limit 2000 znaków, reguły obrazów jak w pytaniach; wstęp z obrazem albo dłuższy niż 140 znaków to pierwszy slajd „Wstęp”, krótszy zwykły tekst zostaje podtytułem (L1) |
| ilustracja czasownika | osobna kolumna `irregular_verbs.image_media_id` | patrz krok L2 |

Walidacja „gdzie wolno” działa w `validate` danego typu pytania, tak jak reguły `cloze`.

### Model danych (migracje)

```sql
CREATE TABLE media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,                 -- np. media/2026/<uuid>.webp
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
  size_bytes   integer NOT NULL CHECK (size_bytes > 0),
  width        integer,
  height       integer,
  sha256       text NOT NULL,                        -- ten sam plik tego autora = jeden wiersz
  status       text NOT NULL CHECK (status IN ('pending','ready')),
  source       text NOT NULL,                        -- browser | mcp-base64 | mcp-url | mcp-presigned | script
  owner_id     text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  ready_at     timestamptz
);
CREATE INDEX media_owner_idx ON media (owner_id, created_at DESC);
CREATE INDEX media_sha_idx   ON media (owner_id, sha256);

CREATE TABLE media_refs (                            -- kto używa pliku; wypełniają konsumenci
  media_id   uuid NOT NULL REFERENCES media(id) ON DELETE RESTRICT,   -- jedyne źródło prawdy o użyciu
  owner_kind text NOT NULL,                          -- 'quiz' | 'lesson' | 'verb'
  owner_id   text NOT NULL,
  PRIMARY KEY (media_id, owner_kind, owner_id)
);

ALTER TABLE irregular_verbs ADD COLUMN image_media_id uuid REFERENCES media(id) ON DELETE RESTRICT;
```

`media_refs` utrzymuje funkcja `syncRefs(ownerKind, ownerId, texts[])`, wołana przy zapisie quizu (`createQuiz`, `replaceQuiz`) i lekcji: wyciąga identyfikatory z treści, w jednej transakcji zastępuje odwołania właściciela i odrzuca zapis, jeśli któryś `mediaId` nie istnieje lub nie jest `ready`. Usuwanie quizu czyści jego odwołania. Dzięki tabeli `media` nie zna schematu konsumentów (żadnych kluczy obcych do `questions` ani `lessons`), a sprzątanie jest zwykłym zapytaniem.

Migracja nie zmienia istniejących quizów; tabele są nowe, kolumna `irregular_verbs.image_media_id` jest opcjonalna. Wykonać: `npm run db:migrate`, zgodnie z regułą repo (Vercel nie stosuje migracji przy wdrożeniu).

### Klucze i nagłówki w magazynie

- Klucz: `<S3_KEY_PREFIX>media/<rok>/<uuid>.<ext>`, gdzie `ext` pochodzi z rozpoznanego typu, a **nigdy z nazwy pliku autora**. Wartości `S3_KEY_PREFIX` rozdzielają środowiska (`dev/`, `preview/`, puste dla produkcji).
- `PutObject`: `Content-Type`, `Cache-Control: public, max-age=31536000, immutable` (klucze są niezmienne), bez `Content-Disposition` z nazwą od użytkownika.
- Pliki nigdy nie są nadpisywane; zmiana obrazu to nowy wiersz i nowy klucz.

## Przepływy wysyłania

Wszystkie kończą się tym samym: wiersz `media` w stanie `ready` i odpowiedź

```jsonc
{ "mediaId": "…", "url": "https://…", "width": 800, "height": 450, "size": 91234,
  "markdown": "![opis](media:…)" }   // gotowe do wklejenia w treść
```

### A. Przeglądarka (edytor)

1. `POST /api/media/uploads { contentType, size, sha256 }` → jeśli ten autor ma już plik o tym skrócie, zwraca istniejący; inaczej wiersz `pending` i presigned PUT (krótka ważność).
2. Przeglądarka zmniejsza obraz (canvas → webp, dłuższy bok ≤ 1600 px) i wysyła **prosto do magazynu** (omija limit 4,5 MB funkcji).
3. `POST /api/media/:id/complete` → serwer pobiera pierwsze bajty (`Range`), sprawdza typ, wymiary i rozmiar, ustawia `ready`; plik niezgodny jest usuwany.

### B. MCP — `media_upload` (obraz w treści wywołania)

- Wejście: `{ contentType, dataBase64, alt? }`. Serwer dekoduje, sprawdza rozmiar (≤ `MEDIA_MAX_BYTES`), rozpoznaje typ po bajtach, zapisuje przez `put`.
- Ograniczenie praktyczne, nie techniczne: model musi **wypisać** base64, a to są tokeny. Obraz rzędu 100 KB to dziesiątki tysięcy tokenów, więc ta ścieżka nadaje się do małych ilustracji (ikony, schematy); opis narzędzia mówi to wprost i odsyła do ścieżki C.
- Limit zapytania: pole `dataBase64` ≤ 2,8 MB znaków (zod), zgodnie z D9.

### C. MCP — `media_upload_from_url` (zalecana)

Serwer pobiera obraz z podanego adresu https i zapisuje go w magazynie. Model, który ma obraz pod adresem (własny hosting, wynik wyszukiwania), nie wypisuje danych.

To jedyna ścieżka z poważnym ryzykiem (SSRF — serwer wykonuje żądanie w imieniu użytkownika), więc wymagania są twarde:

- tylko `https`, tylko port 443, bez danych logowania w adresie;
- adres rozwiązywany **przed** połączeniem, a połączenie wiąże się z tym adresem IP (obrona przed DNS rebinding); odrzucane: loopback, prywatne (10/8, 172.16/12, 192.168/16), link-local i metadane chmury (169.254/16), `::1`, `fc00::/7`, `fe80::/10`, adresy zmapowane IPv4-w-IPv6;
- przekierowania: najwyżej 3, **każdy adres sprawdzany od nowa**, zakaz przejścia na http;
- limit czasu 8 s i limit rozmiaru 2 MB liczony na strumieniu (przerwanie po przekroczeniu), nie po nagłówku `Content-Length`;
- typ rozpoznawany po bajtach, nie po nagłówku odpowiedzi;
- nagłówek `User-Agent` serwera; brak przekazywania nagłówków klienta.

Klasyfikacja adresów IP i parser przekierowań to **czyste funkcje** w `ssrf.ts` z gęstym zestawem testów.

### D. MCP — `media_create_upload` + `media_complete` (dla klientów, które umieją HTTP PUT)

Pierwsze narzędzie zwraca presigned PUT i krótką instrukcję; klient (np. Claude Code z powłoką) wysyła plik, potem woła `media_complete`. Dla ChatGPT w przeglądarce ta ścieżka raczej nie zadziała, bo nie wykonuje własnych żądań HTTP.

### Narzędzia MCP

| Narzędzie | Uprawnienie | Opis |
| --- | --- | --- |
| `media_upload` | `write:quizzes` | ścieżka B |
| `media_upload_from_url` | `write:quizzes` | ścieżka C |
| `media_create_upload`, `media_complete` | `write:quizzes` | ścieżka D |
| `media_list` | `write:quizzes` | własne pliki (admin: wszystkie), filtr `unreferenced`, `limit`/`total` |
| `media_get` | `write:quizzes` | metadane i adres jednego pliku |
| `media_delete` | `write:quizzes`, `confirm: true` | odmowa, gdy plik jest używany (podaje, przez kogo) |
| `lesson_get`, `lesson_update` | `write:quizzes` | wstęp lekcji (`intro`) z obrazami; patrz L1 |
| `verb_set_image` | `write:quizzes` | ilustracja czasownika (`mediaId` albo `null`) |

Każda zmiana trafia do `admin_audit_log` jako `mcp.call` z rozmiarem, źródłem i skrótem (helper `audit` z `server/mcp/context.ts`). Opisy narzędzi odsyłają do `quiz_schema` jako źródła prawdy (zasada z [[mcp-clients]]).

Narzędzia media dodają łącznie 10 do listy: M5 +7, L1 +2, L2 +1. Liczba bezwzględna zależy od kolejności z [[Roadmap]] (narzędzia admina z fazy 3 wchodzą wcześniej: 27 → 42, potem media 49 → 51 → 52), więc w planie podajemy **przyrosty**, a asercję „N tools listed” w `scripts/mcp-local-e2e.ts` i liczbę w `docs/mcp-clients.md` aktualizuje każdy commit, który dodaje narzędzia.

### Limity nadużyć

- Dzienny limit na autora (np. 100 plików i 50 MB; stałe, nie sekret) liczony z tabeli `media`.
- `media_upload_from_url`: dodatkowo najwyżej 20 pobrań na godzinę na autora.
- Ten sam plik (skrót) tego samego autora nie tworzy drugiego wiersza.

## Renderowanie

### Odpowiedzi API

Odpowiedzi z treścią dostają pole `media` z mapą potrzebnych obrazów, zbudowaną jednym zapytaniem po wyciągnięciu identyfikatorów z treści:

- `GET /api/quizzes/:id` (widok gracza i `?include=answers`),
- wyniki oceny (`explanation`),
- `GET /api/courses/:id/lessons/:lessonId` (`intro`, ilustracje czasowników).

Treść zostaje taka, jak ją zapisano (`media:<uuid>`); widok edytora i `quiz_get` też zwracają zapis, więc cykl „pobierz → zmień → zapisz” niczego nie psuje. Brakujący plik w mapie renderuje się jako neutralny znacznik zastępczy z opisem.

### Frontend

- `MediaContext` dostarcza mapę poddrzewu; strony `QuizPlay`, wynik i `LessonView` ją ustawiają, więc głęboko zagnieżdżone komponenty nie dostają jej przez propsy.
- `RichText` zastępuje gołe `{question.prompt}` w nagłówku pytania, w wyjaśnieniu w `ResultView`, w `ChoiceTile` i we wstępie lekcji. Bez `dangerouslySetInnerHTML`: segmenty tekstu to `<span>`, obrazy to `MediaImage`.
- `MediaImage`: `<img>` z `width`/`height` z mapy (brak skoku układu), `loading="lazy"`, `decoding="async"`, `referrerPolicy="no-referrer"`, `max-width: 100%`, `alt` z zapisu. **Obrona dodatkowa:** komponent odmawia renderowania adresu spoza `MEDIA_PUBLIC_BASE_URL`.
- Kafelek wyboru z samym obrazem: `ChoiceTile` rozpoznaje opcję złożoną wyłącznie z obrazu i pokazuje ją w polu o stałej wysokości; etykieta literowa (A, B…) zostaje.
- `cloze`: `Cloze` najpierw dzieli na obrazy, potem szuka znaczników luk w segmentach tekstu.
- Tryb ciemny i telefon: obraz ma tło zastępcze z tokenów antd i `max-height` dopasowane do wysokości widoku (`dvh`), pasek akcji gracza nie może go zasłaniać.

### Content-Security-Policy

Dziś w repo nie ma CSP. Samo `img-src` nie ograniczy nic, bo aplikacja pokazuje awatary z hostów Auth0 (Google, Discord), więc obowiązującą obroną jest allowlista w `RichText` i walidacja przy zapisie. Wprowadzenie CSP można rozważyć osobno (najpierw w trybie `Report-Only`).

## Konfiguracja

| Zmienna | Znaczenie |
| --- | --- |
| `S3_ENDPOINT` | adres usługi (Neon / R2); pusty dla AWS S3 |
| `S3_REGION`, `S3_BUCKET` | region i nazwa bucketu |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | klucze (wpis jako Vercel secret, Production/Preview/Development) |
| `S3_FORCE_PATH_STYLE` | `true` dla Neon (tylko adresowanie path-style) |
| `S3_KEY_PREFIX` | rozdziela środowiska, np. `dev/` |
| `MEDIA_PUBLIC_BASE_URL` | publiczny adres bucketu (do budowy `url` i allowlisty) |
| `VITE_MEDIA_PUBLIC_BASE_URL` | opcjonalnie, to samo co wyżej dla przeglądarki (zmienna budowania Vite; zmiana wymaga ponownego wdrożenia). Gdy ustawiona, `MediaImage` renderuje tylko adresy pod tym prefiksem; gdy pusta, akceptowany jest każdy adres `https:` (`src/features/media/trustedUrl.ts`) |
| `MEDIA_MAX_BYTES` | domyślnie 2097152 |
| `MEDIA_DRIVER` | `s3` (domyślnie) albo `memory` — dla testów i `test:mcp`, bez prawdziwego bucketu |

Dopisać do `.env.example` i `docs/vercel.md`. Zmiany zmiennych na Vercelu wymagają ponownego wdrożenia.

## Niewiadome (rozstrzyga spike M0)

Z dokumentacji Neon Object Storage (sprawdzone 2026-10-19): tylko SigV4, tylko adresowanie path-style, presigned GET/PUT i POST z formularza wspierane, `public_read` zezwala na anonimowy odczyt, brak `PutBucketPolicy` i ACL, Free plan 5 GB na projekt, `DeleteObject` robi soft-delete na bieżącej gałęzi. **Nie wynika z niej:**

1. skąd aplikacja na Vercelu bierze klucze S3;
2. jak ustawić CORS (bez tego `PUT` z przeglądarki nie zadziała);
3. format publicznego adresu obiektu w `public_read`;
4. czy POST z formularza pozwala wymusić górny limit rozmiaru;
5. status usługi (w źródłach ślady bety) i region projektu (baza jest w `us-east-1`; potwierdzić w konsoli).

Nie sprawdzone, ale wpływa na zakres: czy ChatGPT potrafi przekazać załącznik z rozmowy do narzędzia MCP (Apps SDK ma mechanizm parametrów plikowych — do zweryfikowania w bieżącej dokumentacji OpenAI). Jeśli tak, dojdzie czwarta ścieżka wysyłania, bez zmiany reszty planu.

Jeśli Neon odpadnie na któryś z punktów, wystarczy zmiana zmiennych na AWS S3 lub Cloudflare R2; kod się nie zmienia.

## Plan wykonawczy

Każdy krok to osobny commit. Przed commitem: `npm run lint`, `npm test`, `npm run test:ui`, `npm run build`; przy zmianach serwera `npm run build:api` i `MCP_E2E_ALLOW_REMOTE_DB=1 npm run test:mcp`. Kroki M zależą od siebie po kolei, L i U można robić równolegle po M5.

| # | Krok | Zakres | Kryterium ukończenia |
| --- | --- | --- | --- |
| M0 | **Spike** | bucket przez `neon.ts` + `neon deploy`; skrypt `scripts/media-smoke.ts`: presigned PUT, odczyt publiczny, test CORS z przeglądarki; odpowiedzi na niewiadome 1–5; decyzja D7 | notatka z wynikami w tym dokumencie; wiadomo, czy Neon wystarcza |
| M1 | **Fundament** | `server/db.ts` (krok 1 z [[Learning-Slice-Plan]], jeśli jeszcze nie ma); migracja `media`, `media_refs`; `StorageDriver`, `memoryDriver`, `s3Driver`; `sniff.ts`; testy czystych funkcji i sterownika w pamięci | tabele istnieją, `npm test` zielone, pliki zapisują się i odczytują przez `memoryDriver` |
| M2 | **Zapis w treści** | `src/shared/media/richText.ts`, `promptText` z `[obraz: …]`, `extractMediaIds`; reguły „gdzie wolno” w `validate`; `syncRefs` w `createQuiz`/`replaceQuiz`/usuwaniu; opis składni w `quiz.schema.json` (bez zmiany struktury) | quiz z `![…](media:…)` zapisuje się, nieistniejące `mediaId` jest odrzucane z czytelnym błędem, odwołania aktualizują się przy edycji |
| M3 | **Odpowiedzi API z mapą `media`** | `resolveMedia(ids)`; pole `media` w quizie, wyniku i lekcji; typy w `shared` | `GET /api/quizzes/:id` zwraca mapę z wymiarami |
| M4 | **Renderowanie** | `MediaContext`, `RichText`, `MediaImage`, `ChoiceTile` z obrazem, `Cloze`, `ResultView`, `LessonView`; testy komponentów | obraz widać w pytaniu, wyjaśnieniu, kafelku i wstępie lekcji; adres spoza allowlisty się nie renderuje |
| M5 | **MCP: wysyłanie** | `media_upload`, `media_upload_from_url` (z `ssrf.ts` i testami), `media_create_upload`/`media_complete`, `media_list`/`get`/`delete`; limity dzienne; audyt; aktualizacja `test:mcp` (+7 narzędzi, `MEDIA_DRIVER=memory`) | quiz utworzony przez MCP zawiera obraz wysłany przez MCP; testy SSRF przechodzą |
| M6 | **Przeglądarka: edytor** | trasy `/api/media/uploads` i `/complete`; `ImageUpload` z zmniejszaniem; przycisk „Wstaw obrazek” przy treści i wyjaśnieniu w `QuizEditor` z podglądem | autor w edytorze dodaje obraz i widzi go w podglądzie |
| L1 | **Lekcje: wstęp** | `lesson_get`/`lesson_update` (MCP), renderowanie `intro` przez `RichText` jako pierwszy slajd „Wstęp” zamiast podtytułu strony | lekcja z obrazem we wstępie wyświetla się w `LessonView` |
| L2 | **Lekcje: ilustracje czasowników** | kolumna `irregular_verbs.image_media_id`; `verb_set_image`; `VerbSlide`, `VerbTable`, karta powtórki; skrypt `scripts/upload-verb-images.ts` (katalog `<base>.webp`) | slajd czasownika pokazuje ilustrację |
| S1 | **Sprzątanie** | **w ścieżce żądania:** przy `POST /api/media/uploads` usuwane są stare `pending` tego autora (> 1 godzina); dodatkowo endpoint sprzątający z `CRON_SECRET` wołany raz na dobę (`crons` w `vercel.json`, którego jeszcze nie ma) usuwa `ready` bez odwołań starsze niż doba. Plan nie zakłada częstszego crona — na planie Hobby Vercel uruchamia go najwyżej raz dziennie (nie potwierdzone dla tego projektu: `vercel teams ls` nie zwrócił zespołów) | zapytanie i test na danych syntetycznych |
| S2 | **Dokumentacja** | `docs/mcp.md`, `docs/mcp-clients.md`, `docs/vercel.md`, `docs/Quiz-Engine.md`, `CLAUDE.md`, `.env.example` | opis ścieżek wysyłania i składni zapisu |

#### Stan wykonania

- **L1 — zrobione (2026-10-20), serwer i UI, bez przeglądarki.** Reguła: wstęp lekcji z obrazem albo dłuższy niż 140 znaków jest pierwszym slajdem „Wstęp” (`RichText` z mapą `media` lekcji); krótki wstęp bez obrazów zostaje podtytułem strony jak dotąd. Reguły: `src/shared/quiz/lessonIntro.ts` (`validateLessonIntro`: do 2000 znaków i reguły obrazów z `richText.ts`, czyli alt 1–200, najwyżej trzy, tylko `media:<uuid>`, zewnętrzne adresy odrzucone; `introNeedsSlide`). Zapis: `updateLesson` w `server/coursesRepo.ts` w jednej transakcji z `syncRefs('lesson', …)`, więc odrzucony obraz nie zmienia lekcji. API: `GET /courses/:id/lessons/:lessonId` dodaje `media` tylko przy obrazach we wstępie (`resolveMedia`, bez zapytania, gdy ich nie ma). MCP: `lesson_get` i `lesson_update` (`write:quizzes`, tytuł 1–120, wstęp przez `validateLessonIntro`; audyt zapisuje długości, nie tekst); `course_list` dostał dodatkowe pole `lessonList` z id lekcji. UI: `src/pages/LessonView.tsx` (licznik „x / n” i nawigacja liczą slajd wstępu; ukończenie tylko na ostatnim czasowniku; autoodtwarzanie nie czyta wstępu), testy `src/pages/LessonView.test.tsx` (jsdom). **Niesprawdzone:** układ, tryb ciemny i telefon w przeglądarce; wyświetlanie z prawdziwego bucketu. **Nie zrobione:** L2 (ilustracje czasowników).
- **M5 — zrobione (2026-10-20), bez prawdziwego bucketu i bez sieci.** Narzędzia: `media_upload`, `media_upload_from_url`, `media_create_upload`, `media_complete`, `media_list`, `media_get`, `media_delete` (`server/mcp/tools/media.ts`, `write:quizzes`, każda zmiana audytowana jako `mcp.call`). Logika: `server/media/uploads.ts` (czysta: base64, alt, typ, rozmiar, sprawdzenie po wysyłce, limit godzinowy), `service.ts` (magazyn, tabela, limity dzienne), `ssrf.ts` (klasyfikacja IP i URL, przekierowania; `tests/mediaSsrf.test.ts`), `fetchImage.ts` (pobieranie z wstrzykiwanym DNS i transportem; `tests/mediaFetchImage.test.ts`), `nodeTransport.ts` (jedyne miejsce z siecią, bez testów). `MEDIA_URL_FETCH` domyślnie wyłączone. E2E: 268 sprawdzeń, w tym sekcja obrazów (wysyłka, ponowne użycie, odmowy, referencje, usuwanie z magazynu, niezgodność, limit dzienny, audyt bez bajtów). **Niesprawdzone:** prawdziwy bucket (podpisy, CORS, odczyt publiczny), przypinanie połączenia na Vercelu (hak `lookup`), zachowanie `fetch` z prawdziwym DNS i TLS.
- **M0 — czeka na właściciela (CLI Neona).** Spike wymaga logowania do Neona i prawdziwego bucketu; nie wykonano. Gotowe: skrypt `npm run media:smoke` (`scripts/media-smoke.ts`, `--dry` sprawdza tylko konfigurację) i runbook poniżej. Wynik trafia do tabeli „Niewiadome 1-5: odpowiedzi”.
- **M2 — zrobione (2026-10-20).** `src/shared/media/richText.ts` (parser, `imageSyntaxErrors`, limity 3 na pole i 100 na quiz, uuid tylko małymi literami); `imageFieldErrors` w `engine.ts` (gdzie wolno: prompt, wyjaśnienie, opcje single/multiple/truefalse; odrzucone: opcje `text`, pary, elementy, luki, odpowiedź liczbowa); `promptText` zamienia obraz na `[obraz: opis]`; `{{n}}` w opisie obrazu nie jest luką; `quiz.schema.json` z opisami i wzorcem (pusty opis, adres spoza `media:`, opis dłuższy niż 200 znaków); `createQuiz`/`replaceQuiz` wołają `syncRefs` w transakcji, `deleteQuiz` czyści odwołania w transakcji; `MediaRefError` → 400 w REST i błąd narzędzia w MCP. **Decyzja o własności:** nie egzekwujemy właściciela pliku — prawo zapisu quizów (`write:quizzes`) mają tylko admini, a admin może użyć każdego pliku `ready`; egzekwowanie zablokowałoby współdzielenie bez zysku. Znana luka parytetu: JSON Schema nie sprawdza istnienia pliku ani „gdzie wolno” dla opcji `text` i pól konfiguracji, ani limitów liczby (test `KNOWN PARITY GAP` w `tests/quizSchema.test.ts`). E2E: sekcja „images in quiz text” w `scripts/mcp-local-e2e.ts`; `test:mcp` z `MEDIA_DRIVER=memory`.
- **M3 — zrobione (2026-10-20).** `src/shared/media/types.ts` (`MediaInfo`, `MediaMap`); `media?` w `QuizDetail` i `GradedAttempt`. `server/media/mediaMap.ts` (czyste: `buildMediaMap`, `withMedia`, `resolveMediaWith` z wstrzykniętym odczytem) i `resolve.ts` (zapytanie `getReady`: jedno, tylko `ready`; brak id albo brak `MEDIA_PUBLIC_BASE_URL` = brak zapytania, a przy braku bazy jeden ustrukturyzowany `warn` i brak adresów, bez błędu żądania). Adres to `MEDIA_PUBLIC_BASE_URL` + zapisany klucz (`mediaUrlFor`, `publicBaseUrlOf`); sterownik magazynu nie jest wołany. `GET /api/quizzes/:id` (widok gracza: z pytań i opcji, które widok zawiera; `?include=answers`: także wyjaśnienia) i odpowiedź oceny (wyjaśnienia oceniane pytań i wybrane albo poprawne opcje; wolny tekst gracza nie jest skanowany). Quiz bez obrazów: klucza `media` nie ma wcale (sprawdzone testem i e2e).
- **M4 — zrobione (2026-10-20), tylko frontend, bez przeglądarki.** `src/features/media/`: `mediaContext.ts`, `MediaProvider.tsx` (zagnieżdżone mapy łączą się, wewnętrzne wpisy wygrywają), `useMedia.ts`, `trustedUrl.ts` (czysta allowlista: `https:`, `http://localhost` tylko w dev, bez danych logowania w adresie, prefiks `VITE_MEDIA_PUBLIC_BASE_URL` porównywany jako katalog), `MediaImage.tsx` (`<img>` z wymiarami z mapy, `loading=lazy`, `decoding=async`, `referrerPolicy=no-referrer`; brak wpisu albo niezaufany adres = znacznik „Obraz niedostępny” z `role=img` i opisem), `RichText.tsx` (tekst jako `<span>`, obrazy jako bloki; bez `dangerouslySetInnerHTML`), `imageOnly.ts`. `QuizPlayer` ustawia mapę quizu, `ResultView` dokłada `result.media`. Gdzie wchodzi `RichText`: nagłówek pytania, wyjaśnienie, przegląd (pytanie i odpowiedzi wyboru), tekst opcji `ChoiceTile`; opcja złożona tylko z obrazu to kafelek z obrazem (`choice-tile--image`). `cloze` dzieli treść najpierw na obrazy (`clozePieces.ts`), numeracja luk zostaje. Testy jsdom: `src/features/media/*.test.*`, `src/features/quizzes/*.media.test.tsx`, `clozePieces.test.ts`. **Niesprawdzone w przeglądarce:** układ, tryb ciemny, telefon (`dvh`, pasek akcji), faktyczne ładowanie z bucketu i CORS. **Nie zrobione:** wstęp lekcji i ilustracje czasowników (L1, L2), podgląd obrazów w edytorze quizów (M6), `Ordering`/`Matching` (tekst zwykły; opcje tych typów nie mogą mieć obrazów), a `AttemptDetails` (rozwijane odpowiedzi w tabeli prób) nadal pokazuje surowy `prompt`, więc obraz w pytaniu ujawni się tam jako składnia `![…](media:…)` — do poprawki przez `promptText`, CSP (osobny krok, najpierw `Report-Only`).
- **M6 — zrobione (2026-10-20), serwer i edytor, bez przeglądarki i bez bucketu.** Trasy `server/media/routes.ts` (wszystkie z `write:quizzes`): `POST /api/media/uploads` (ponowne użycie gotowego pliku autora bez wysyłki; w przeciwnym razie wiersz `pending` i cel PUT), `POST /api/media/:id/complete` (ta sama usługa co `media_complete`; niezgodny plik jest usuwany), `PUT /api/media/:id/content` tylko dla `MEDIA_DRIVER=memory` (w innym przypadku 404; dla dev i testów; cel PUT w trybie memory to ścieżka tego samego serwera, `/api/media/<id>/content`). Każde zakończenie (gotowe i odrzucone) trafia do audytu jako `media.upload` (rozmiar, źródło `browser`, skrót, wynik). Edytor: `src/features/media/ImageUpload.tsx` (okno: plik, opis alt wymagany 1–200, podgląd, „Wyślij i wstaw”) z przygotowaniem w `prepareImage.ts` (dłuższy bok ≤ 1600 px, WebP 0,85, najwyżej 2 MB; GIF i SVG odrzucane; wstrzykiwane elementy przeglądarki, więc testy bez canvasu), wysyłką w `uploadImage.ts` (przygotowanie → skrót SHA-256 → start → PUT → complete), wstawianiem przy kursorze w `markdownInsert.ts`. Przycisk jest przy treści pytania, wyjaśnieniu i opcjach `single`/`multiple` (nie przy `truefalse`, bo etykiety są stałe, i nie przy odpowiedziach tekstowych). Podgląd pod polem przez `FieldPreview`. **Niesprawdzone:** wybór pliku, kodowanie w canvasie, układ i telefon w przeglądarce; wysyłka surowym ciałem przez adapter serwerless Vercela (trasa PUT w trybie memory); prawdziwy bucket i CORS. **Znana wada lokalna:** w trybie memory publiczny adres to `https://media.test`, więc podgląd w edytorze pokazuje niedostępny obraz (tylko PUT idzie przez API); w produkcji adres jest prawdziwy.
- **M1 — zastosowane na bazie.** `server/media/`: `driver.ts` (interfejs i `getStorage()` wybierany przez `MEDIA_DRIVER`), `config.ts` (zmienne, błąd z nazwami brakujących), `s3Driver.ts` + `sigv4.ts` (własny SigV4, path-style), `memoryDriver.ts`, `sniff.ts`, `keys.ts`, `limits.ts`, `repo.ts` (cały SQL modułu, `syncRefs`, `MediaRefError`). Migracja `db/migrations/20261020110000_media.sql` tworzy `media` i `media_refs` (addytywnie, bez kolumny `irregular_verbs`, która należy do L2). Testy w `tests/media*.test.ts` (`npm test`) zielone. **Niesprawdzone:** migracja i zapytania `repo.ts` na prawdziwej bazie, zachowanie S3 wobec prawdziwego bucketu (podpisy zweryfikowane tylko na wektorach dokumentacji AWS, nie przez żądanie), CORS i presigned PUT z przeglądarki. `api/index.mjs` nie zmienił się, bo moduł nie jest jeszcze importowany.

## Runbook M0 (dla właściciela)

Cel: rozstrzygnąć niewiadome 1–5 i wybrać dostawcę (D7) **przed** wdrożeniem M6 na Production. Każdy krok ma oczekiwany wynik i to, co zapisać w tabeli poniżej. Kroki 1–5 nie zmieniają produkcji.

1. **Sesja CLI Neona.** Uruchom `neon me` (zalogowany właściciel) i `neon projects list`. *Oczekiwane:* właściwy projekt; region projektu to `aws-us-east-1` (host bazy wskazuje us-east-1), a Object Storage jest dostępny w tym regionie. *Zapisz:* region i odpowiedź o dostępności (niewiadoma 5, region).
2. **Dokumentacja bucketów i CORS.** Uruchom `neon skills -s neon-object-storage --global -y --agent claude` (oficjalna umiejętność) albo otwórz https://neon.com/docs/reference/neon-ts.md (sekcja buckets). *Oczekiwane:* lista dozwolonych wartości `access`, sposób ustawienia CORS, format publicznego adresu obiektu, czy POST z formularzem przyjmuje limit rozmiaru, status usługi. *Zapisz:* odpowiedzi do tabeli (niewiadome 2–5).
3. **Bucket w `neon.ts`.** Edytuj istniejący, śledzony w git plik `neon.ts` (nie przepisuj go; zostaw `auth: false` i politykę gałęzi); dodaj `buckets: { media: { access: '<wartość z kroku 2>' } }`, np. `public_read`. Przed zastosowaniem sprawdź plan: `neon config --help` i `neon deploy --help` (szukaj opcji planu albo dry-run). Zastosuj na osobnej gałęzi: `neon checkout media-spike --create`, potem `neon deploy`. *Uwaga:* usunięcie obiektu na bieżącej gałęzi to soft-delete. *Oczekiwane:* bucket `media` utworzony. *Zapisz:* nazwę bucketu i to, czy CLI wspomniało o CORS.
4. **Klucze.** Uruchom `neon env pull`; sprawdź, do którego pliku zapisuje (ma być `.env.local`, który jest w `.gitignore`; po kroku `git status` nie może pokazać go jako zmiany). Zmapuj zmienne Neona na nasze nazwy w `.env.local`: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE=true`, `S3_KEY_PREFIX=dev/`, `MEDIA_PUBLIC_BASE_URL`, `MEDIA_DRIVER=s3`. *Oczekiwane:* komplet zmiennych bucketu. *Zapisz:* jak aplikacja na Vercelu dostałaby klucze (niewiadoma 1): czy ręcznie (`vercel env`), czy przez integrację Neon–Vercel.
5. **Smoke.** `npm run media:smoke -- --dry`: *oczekiwane:* brak brakujących zmiennych i komunikat „Configuration is valid”. Potem `npm run media:smoke`: *oczekiwane:* każdy wiersz PASS. Skrypt nie drukuje sekretów ani podpisanych adresów. Wklej tabelę poniżej, w bloku „Wynik smoke”. *Zapisz:* odpowiedzi 2–4 z wyniku.
6. **Decyzja o CORS.** Jeśli „CORS preflight” albo „CORS on the public GET” kończy się FAIL i nie da się tego ustawić, wybierz: (a) R2 albo AWS S3 (zmiana tylko zmiennych środowiskowych, kod bez zmian), albo (b) rozszerzyć `PUT /api/media/:id/content` o obsługę s3 (serwer pośredniczy; obraz po zmniejszeniu jest mały, więc limit funkcji Vercela nie przeszkadza). *Zapisz:* wybór i powód w tabeli.
7. **Zmienne na Vercelu.** `vercel env add` dla każdej zmiennej `S3_*` i `MEDIA_*` (klucze jako secret) w środowiskach Production, Preview i Development. `MEDIA_URL_FETCH` zostaje nieustawione albo `false`. `VITE_MEDIA_PUBLIC_BASE_URL` ma wartość `MEDIA_PUBLIC_BASE_URL`. Potem **ponowne wdrożenie** (zmiany zmiennych tego wymagają). Migracja nie jest potrzebna (schemat `media` jest już w bazie). *Oczekiwane:* `vercel env ls` pokazuje zmienne. *Nie stosuj do Production, zanim krok 8 przejdzie na Preview.*
8. **Podgląd (Preview).** Na wdrożeniu Preview: w edytorze quizu wstaw obraz („Wstaw obrazek”), sprawdź podgląd w edytorze, odtwarzanie quizu i wynik; przez MCP `media_upload` wyślij mały PNG i sprawdź, że quiz go pokazuje. Sprawdź anonimowy dostęp do adresu obrazu i preflight CORS z domeny aplikacji (narzędzia deweloperskie → Network: `OPTIONS` i `PUT`). *Zapisz:* wynik każdego punktu i uwagi z narzędzi (nagłówki, błędy konsoli).
9. **Domknięcie.** Uzupełnij tabelę, rozstrzygnij D7 (dostawca) w tabeli decyzji poniżej i zaktualizuj wiersz 4.6 w `docs/Roadmap.md` (weryfikacja na bucketcie wg wyniku).

### Niewiadome 1-5: odpowiedzi

| # | Pytanie | Odpowiedź | Źródło (krok, data, wynik) |
| --- | --- | --- | --- |
| 1 | Skąd aplikacja na Vercelu bierze klucze S3? | | |
| 2 | Czy i jak ustawić CORS na buckecie? | | |
| 3 | Format publicznego adresu obiektu w `public_read` | | |
| 4 | Czy POST z formularzem wymusza górny limit rozmiaru? | | |
| 5 | Status usługi (beta?) i region projektu | | |

| Decyzja | Wartość |
| --- | --- |
| D7 (dostawca) | |
| Wybór z kroku 6 (CORS) | |
| Data wdrożenia Preview / Production | |

Wynik smoke (wklej tabelę z `npm run media:smoke`):

```text

```

## Szacunek (moja ocena, bez M0)

M1 1 dzień, M2 1 dzień, M3–M4 1,5 dnia, M5 2 dni (SSRF jest najdroższe), M6 1 dzień, L1–L2 1 dzień, S1–S2 0,5 dnia — łącznie około 8 dni. M0 pół dnia i zmienia szacunek, jeśli Neon nie wystarczy.

## Testy

| Obszar | Przypadki |
| --- | --- |
| `richText` | obraz w środku zdania, kilka obrazów, brak opisu, `media:` ze złym uuid, `https://…` odrzucony, znaczniki `{{n}}` obok obrazu, przekroczone limity |
| `sniff` | PNG/JPEG/WebP rozpoznane po bajtach; SVG, GIF i plik tekstowy z deklarowanym `image/png` odrzucone; odczyt wymiarów |
| `ssrf` | 127.0.0.1, 10.x, 172.16.x, 192.168.x, 169.254.169.254, `::1`, `fc00::`, `::ffff:127.0.0.1`, liczba dziesiętna jako IP, `localhost`, przekierowanie na adres prywatny, `http`, port inny niż 443, odpowiedź większa niż limit bez `Content-Length` |
| walidacja quizu | obraz w opcji typu `text` odrzucony; nieistniejące i `pending` `mediaId` odrzucone; zapis bez obrazu działa jak dotąd; zgodność zod ↔ JSON Schema |
| `syncRefs` | edycja quizu zmienia odwołania; usunięcie quizu je czyści; `media_delete` odmawia dla używanego pliku |
| MCP (`test:mcp`, `MEDIA_DRIVER=memory`) | `media_upload` + `quiz_create` z obrazem + `quiz_get` zwraca zapis; odmowa bez `write:quizzes`; limit dzienny; wpisy w audycie; narzędzia widoczne w liście |
| UI | `RichText`/`MediaImage`: alt, brak adresu spoza allowlisty, znacznik zastępczy dla brakującego pliku, tryb ciemny, kafelek z obrazem |
| smoke (ręcznie, M0) | prawdziwy bucket: wysłanie, odczyt anonimowy, CORS z domeny aplikacji |

## Ryzyka

- **SSRF w `media_upload_from_url`:** największe ryzyko planu. Ograniczenia z listy wyżej są obowiązkowe; jeśli któregoś nie da się zagwarantować na Vercelu (np. wiązanie połączenia z adresem IP), narzędzie **nie wchodzi** do wydania, a zostają ścieżki B, D i przeglądarka.
- **Nieznane zachowanie Neon Object Storage** (CORS, klucze, status bety): M0 zmniejsza ryzyko przed pracą nad resztą.
- **Koszt tokenów ścieżki B:** model może próbować wysłać duży obraz w base64; opis narzędzia i limit pola mają to ograniczać.
- **Utrata pliku:** soft-delete w Neonie nie zwalnia miejsca natychmiast; sprzątanie usuwa wiersze i obiekty, ale pojemność wymaga obserwacji.
- **Stare klienty MCP:** nowe narzędzia pojawią się dopiero po odświeżeniu konektora (patrz [[mcp-clients]]).

## Kryteria akceptacji całości

- Model przez MCP wysyła obraz (B lub C), tworzy quiz z `![opis](media:…)` w pytaniu, a uczeń widzi obraz w odtwarzaczu i w przeglądzie wyniku.
- Wstęp lekcji i ilustracja czasownika wyświetlają się w `LessonView`.
- Zapis obrazu z obcego hosta jest odrzucany z komunikatem wskazującym `media_upload_from_url`.
- Żaden istniejący quiz nie zmienia wyglądu ani oceny.
- `media` nie importuje nic z `quizzes`, `learning`, `progress` ani `classes`; klient S3 importowany tylko w `server/media`.
- Wszystkie sprawdzenia z listy „Przed commitem” zielone.

## Powiązane

- [[Learning-Slice-Plan]] — podział modułów i miejsce modułu `media`
- [[Cloze-Fixes-Plan]] — kolejność znaczników luk i treści (wspólny `promptText`)
- [[MCP-Admin-Tools]] — uprawnienia i audyt narzędzi administracyjnych
- [[mcp]], [[mcp-clients]] — serwer MCP i rejestracja klientów
- [[Quiz-Engine]] — silnik i typy pytań
- [[vercel]] — zmienne środowiskowe i wdrożenie
