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
updated: 2026-10-19
---

# Magazyn obrazów w S3 — plan wykonawczy

> Obrazki w quizach i lekcjach: przechowywanie w magazynie zgodnym z S3, wysyłanie przez przeglądarkę **i przez MCP**, wstawianie do treści jednym prostym zapisem i bezpieczne renderowanie. Doprecyzowuje sekcję „Moduł media (S3)” z [[Learning-Slice-Plan]] i zastępuje w niej projekt kolumn `image_id` zapisem w treści (patrz D2). Stan: plan, nic jeszcze nie wdrożono.

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
| D10 | Klient S3 | w M0 zmierzyć, ile `@aws-sdk/client-s3` dodaje do `api/index.mjs` (obecnie `build:api` wyłącza z paczki tylko `pg-native` i `@sentry/node`) i do zimnego startu; domyślnie SDK, a **własny SigV4** (`node:crypto`, około 80 linii, testy na wektorach AWS) jeśli przyrost jest zauważalny | pakiet nie jest dziś zależnością; decyzja przed M1, nie w trakcie |
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
| `lessons.intro` | tak | kolumna istnieje (`NOT NULL DEFAULT ''`) i dziś jest tylko podtytułem strony |
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

### Szacunek (moja ocena, bez M0)

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
