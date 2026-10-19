---
tags:
  - plan
  - quiz
  - frontend
  - backend
created: 2026-10-19
updated: 2026-10-19
---

# Plan wdrożenia: nowe typy pytań (fundament + `numeric` → `ordering` → `matching` → `cloze`)

Dokument wykonawczy do [question-types.md](question-types.md). Tam jest uzasadnienie biznesowe i lista pomysłów;
tutaj są **decyzje, kolejność commitów, kontrakty i kryteria akceptacji** — na tyle konkretne, żeby zacząć bez
dodatkowych ustaleń.

Zasady, których plan pilnuje:

1. **Zgodność wsteczna.** Stare quizy (4 typy, `options`) i quizy generowane (`server/verbQuizBuilder.ts`) muszą
   działać bez migracji danych i bez zmiany zachowania.
2. **Ocena i tasowanie wyłącznie na serwerze.** `gradeQuiz` zostaje jedynym miejscem oceniania; frontend nie dostaje
   odpowiedzi ani poprawnej kolejności (także „zakodowanej” w identyfikatorach).
3. **Jeden pionowy przekrój na przyrost.** Każdy typ przechodzi całą ścieżkę: schemat → baza → edytor (także
   *wczytanie do edycji*) → gracz → ocena → przegląd próby → JSON Schema → MCP/CLI, z testami. Fundament nie jest
   osobnym, „pustym” przyrostem — wchodzi razem z pierwszym typem (`numeric`), żeby nowe haki miały realnego konsumenta.
4. **Bez `schemaVersion` w pierwszej iteracji.** Zgodność zapewnia to, że `options` zostaje dla starych typów,
   a `config` jest nowym, opcjonalnym polem. Wersjonowanie dopiero przy pierwszej zmianie niekompatybilnej.
   (To świadome odejście od punktu 2 „Zmiany w modelu danych” w [question-types.md](question-types.md) — tam trzeba
   to zaktualizować, patrz faza 5.)
5. **Bez własnego magazynu plików.** Dwa hostingi (Netlify + Vercel/Neon) nie dzielą Blobs; multimedia tylko jako
   zewnętrzny URL. Upload — osobny projekt po decyzji o hostingu.

---

## 0. Wnioski z przeglądu planu względem kodu

Pierwsza wersja planu była spójna co do kierunku, ale **pomijała kilka miejsc, które by się zepsuły albo zgubiły dane**,
oraz zawierała cztery decyzje, które w praktyce dawałyby wyciek odpowiedzi lub niesprawiedliwą ocenę. Poprawki są
wprowadzone w dalszych sekcjach; tu skrót.

### Błędy, które plan musiał naprawić

| # | Znalezisko | Dowód w kodzie | Zmiana |
| --- | --- | --- | --- |
| F1 | **Edycja quizu gubi `config`.** Strona edycji buduje wartości formularza tylko z `type/prompt/explanation/points/options` — po „Zapisz zmiany” nowe pytania straciłyby konfigurację (cichy wynik: pytanie bez poprawnej odpowiedzi albo błąd walidacji). | `src/pages/QuizEdit.tsx:25-33` | `QuizEdit.tsx` w liście zmian fazy 1; test „wczytaj → zapisz → to samo” |
| F2 | **`scripts/quiz-tool.mjs download` też gubi `config`** — a plan twierdził, że „przepuszcza dowolny obiekt”. To dotyczy tylko `upload`; `download` składa pytania pole po polu (przy okazji pomija już dziś `subject`). | `scripts/quiz-tool.mjs:176-189` | `download` kopiuje `config` i `subject`; test round-trip |
| F3 | **Widok wyniku dla gracza nie pochodzi z `server/classes/results.ts`**, tylko z `ResultView.tsx`, który sam składa „twoja odpowiedź” (`type === 'text' ? given.text : optionText(...)`) i etykietę „Akceptowane odpowiedzi”. Dla nowych typów pokazałby pustkę. | `src/features/quizzes/ResultView.tsx:288-293, 405-428` | `ResultView.tsx` używa `result.answerText`; etykieta z rejestru |
| F4 | **`correctAnswers: string[]` jest używane w 4 miejscach** (`ResultView`, `AttemptDetails`, `studentAnalysis.hardestQuestions`, `results.ts`). `gradeQuiz` wylicza je z `options`, więc dla typów z `config` byłoby `[]` — „Poprawnie:” znika. Pierwotny plan dokładał drugie, równoległe pole `correctText`. | `engine.ts:145`, `AttemptDetails.tsx:24`, `studentAnalysis.ts:84-92` | **Jedno** nowe pole `answerText`; `correctAnswers` wypełnia `describe` (bez `correctText`) |
| F5 | **`matching`: identyfikator prawej strony = identyfikator pary to wyciek.** Gracz dostaje lewą stronę z `id` pary i prawą potasowaną „z `id`” — jeśli to ten sam `id`, para jest czytelna w odpowiedzi HTTP. | pierwotna faza 3 | para ma **osobne** `id` i `rightId` |
| F6 | **Ocena po `id` karze za zamianę nierozróżnialnych kafelków.** Dwie identyczne pozycje w `ordering` albo dwie identyczne prawe strony w `matching` (`być → be`, `istnieć → be` — to poprawny quiz językowy) są dla ucznia takie same, a ocena po `id` dałaby 0 pkt za ich zamianę. | pierwotne D4/faza 2-3 | **ocena po znormalizowanym tekście** (D10); `id`/`rightId` tylko wskazują kafelek w odpowiedzi. Duplikatów nie zabraniamy |
| F7 | **`cloze`: sprzeczność D5 z modelem.** `id` luk miały być generowane przy zapisie, a treść pytania zawiera `{{id}}` — po zapisie znaczniki w treści straciłyby sens. | pierwotne D5 vs 2.2 | znaczniki `{{1}}`, `{{2}}`…; luka = pozycja w tablicy, bez `id` |
| F8 | **Treść `cloze` z `{{1}}` wycieka do widoków tekstowych** (`AttemptDetails`, `studentAnalysis`, powtórki, lista błędów). | `AttemptDetails.tsx:21`, `results.ts` (`SELECT prompt`) | pomocnik `promptText()` zamienia znaczniki na `___` |
| F9 | **Dwa miejsca „czy odpowiedziano”** (`isAnswered` na froncie i `answered` w trasie `grade`) to dwie kopie tej samej reguły. | `questionRenderers.tsx:73`, `routes/quizzes.ts:167` | jedna funkcja `isAnswered` w `engine.ts`, importowana przez oba |
| F10 | **Typowanie rejestru.** `Record<QuestionType, QuestionTypeDef<…>>` z generykiem per typ nie skompiluje się przy `strictFunctionTypes` (parametr funkcji-właściwości jest kontrawariantny), a `config: unknown` przepuszczałby cokolwiek. Kompilator wymusi komplet *kluczy* rejestru, ale nie spójność typu `config` z resztą metod. | `engine.ts:28-35` | `configSchema` (zod per typ) parsowany raz na granicy; `validate/grade/describe` dostają już typowany config |
| F11 | **`config` w zod jako `z.record(z.unknown())` nie ma „ograniczonego rozmiaru”** — zod nie limituje liczby kluczy ani głębokości. | `schema.ts` | limit rozmiaru przez `refine` na długości JSON + per-typowe schematy |
| F12 | **`data/quiz.schema.json`: samo usunięcie `options` z `required` nie wystarcza** — gałęzie `if/then` ograniczają `options.minItems`, ale przy *braku* pola nie odpalają się; `{type:"single"}` bez opcji by przeszło. | `quiz.schema.json:63-120` | `then` dla starych typów dostaje `"required":["options"]` |
| F13 | **Typy, które nie używają `options`, mogłyby je dostać** (`numeric` z opcjami) i zapisywać śmieci. | — | `usesOptions:false` ⇒ `options` musi być puste |
| F14 | **`describe` w pierwotnym kontrakcie dostawał `StoredQuestion`**, ale `gradeQuiz` widzi tylko `GradableQuizQuestion`. Oba muszą dostać ten sam typ, inaczej ocena i opis się rozjadą. | `engine.ts:102-115` | wszystko operuje na `GradableQuizQuestion` (+ `config`) |
| F15 | **Numeryczne parsowanie miało sprzeczność:** D8 nie wymienia `%`, faza 1 tak; `1,000` byłoby cicho `1.0`; błąd zmiennoprzecinkowy (`0,1+0,2`) przy tolerancji 0. | — | reguły w D8 doprecyzowane |
| F16 | **Test MCP: narzędzia `quiz_grade` nie ma** (jest `quiz_create/delete/get/list/schema/update`). Ocena idzie przez REST — tak robi już `scripts/mcp-local-e2e.ts`. | `server/mcp/quizTools.ts` | punkt 3 w sekcji testów poprawiony |
| F17 | Liczba „187 testów” w kryterium akceptacji nie ma pokrycia w repo i szybko się zdezaktualizuje. | — | „wszystkie dotychczasowe testy bez zmiany oczekiwań” |

### Co się potwierdziło (zostaje bez zmian)

- Brak `CHECK` na `questions.type` w migracji — **nowe typy nie wymagają zmiany ograniczeń w bazie**.
- Generator czasowników, powtórki Leitnera, słabe czasowniki, losowanie próbki (`resolveGradedIds`) i CSV klasy
  nie zależą od struktury pytania — bez zmian (tylko `correct: boolean` i `questionId`).
- `quiz_attempts.score` jest `NUMERIC`, `results` to `JSONB` — punkty ułamkowe i nowe pola w wyniku nie wymagają migracji.
- Test `tests/quizSchema.test.ts` (te same dokumenty akceptowane/odrzucane przez zod i JSON Schema) jest dobrym
  mechanizmem — wystarczy dopisywać przypadki dla każdego typu.
- Numer migracji `20261019120000_…` jest większy od ostatniej (`20261019100000_quiz_subjects.sql`).

---

## 1. Decyzje projektowe

| # | Decyzja | Uzasadnienie |
| --- | --- | --- |
| D1 | `questions.config jsonb NULL` obok `options` | starych pytań nie ruszamy; `jsonb` mieści wszystko, czego potrzebują nowe typy |
| D2 | `options` staje się **opcjonalne** (`default([])`); dla typów z `usesOptions: true` wymagane dalej przez `validate`, dla pozostałych **musi być puste** | reguły per typ już siedzą w rejestrze; stare typy są i tak chronione (`single` wymaga ≥2 opcji itd.) |
| D3 | Rejestr dostaje `playerView(question, rng)` i `describe(question, answer)` | usuwa łańcuch `if (type === 'text')` z `quizRepo.getQuiz`; `rng` wstrzykiwany, więc tasowanie jest testowalne |
| D4 | Odpowiedzi nowych typów są **identyfikatorowe** (UUID nadawane przy zapisie), nie tekstowe | opaque `id` nie zdradza kolejności ani dopasowania (w przeciwieństwie do indeksu lub `1,2,3`) |
| D5 | `id` w `config` (elementy `ordering`, pary `matching`: `id` **i** `rightId`) nadaje serwer w `insertQuestions`; `id`/`rightId` przychodzące z wejścia są **przyjmowane i ignorowane** | dzięki temu `quiz_get(withAnswers)` → `quiz_update` działa bez ręcznego usuwania `id`, a autor nie może „zakodować” kolejności w identyfikatorach. Zachowanie identyczne jak dziś dla `options` (id zmieniają się przy `PUT`). **Wymóg implementacyjny:** `configSchema` deklaruje `id`/`rightId` jako `z.string().optional()` (nigdy `.strict()` bez nich), a w `quiz.schema.json` elementy `items`/`pairs` je dopuszczają — inaczej test round-trip z F1 padnie z niezrozumiałego powodu |
| D6 | Wynik pytania dostaje **jedno** nowe pole `answerText` (czytelna odpowiedź gracza); `correctAnswers: string[]` zostaje i dla typów z `config` wypełnia je `describe`. `describe` działa też dla 4 starych typów | nie ma równoległego `correctText`; przegląd działa po edycji quizu i naprawia dzisiejsze „?” w odpowiedzi ucznia, gdy opcje zostały wymienione `PUT`-em (`results.ts:40-47`). Dla historycznych prób bez `answerText` zostaje obecny fallback |
| D7 | Punktacja: `cloze` i `matching` proporcjonalnie, `ordering` całość (0/1) | luki i pary są niezależne; kolejność jest jedna, częściowe punkty mylą uczniów. `correct` w wyniku = `fraction === 1` (bez zmian), więc powtórki i „słabe” działają jak dotąd |
| D8 | `numeric` — patrz reguły niżej | |
| D9 | `open`, `expression`, `hotspot`, `categorization` poza zakresem | `open` zmienia model oceny (trzeci stan próby), `expression` wymaga CAS, `hotspot` magazynu plików, `categorization` to rozszerzenie `matching` |
| D10 | **Ocena `ordering` i `matching` po znormalizowanym tekście** (`normalizeText`), nie po `id`. `ordering`: sekwencja tekstów wskazana przez `order` musi równać się sekwencji poprawnej. `matching`: para jest poprawna, gdy tekst wybranej prawej strony = `right` pary; `rightId` użyty już przez wcześniejszą parę (kolejność `pairs`) nie liczy się ponownie. Duplikaty tekstów są **dozwolone** | uczeń nie odróżni dwóch takich samych kafelków, a quiz z kilkoma lewymi stronami o tym samym tłumaczeniu jest poprawny dydaktycznie. `id` służą tylko do wskazania kafelka w odpowiedzi |
| D11 | `isAnswered` (jedna funkcja w `engine.ts`) liczy odpowiedź jako udzieloną, gdy: `optionIds` niepuste, `text` niepusty po `trim`, `order` niepuste, `pairs` ma ≥1 wpis, `gaps` ma ≥1 niepusty wpis | zastępuje dwie kopie (front i trasa `grade`) |
| D12 | Walidacja `config`: **zod per typ** (`configSchema` w definicji typu) wywoływany z `superRefine`, błąd na ścieżce `['config', …]`; do tego limit rozmiaru (`JSON.stringify(config).length ≤ 20 000`) | typowany `config` w `validate/grade/describe` i sensowne komunikaty; `z.record(z.unknown())` samo niczego nie ogranicza |

### D8 — reguły `numeric`

- Odpowiedź gracza idzie w istniejącym polu `Answer.text` (bez nowego pola; `isAnswered` działa bez zmian). `numeric` ma własny parser i **nie** używa `normalizeText` (zmiana wielkości liter / zwijanie spacji dotyczy tylko typów tekstowych).
- Separator dziesiętny: przecinek **albo** kropka (`0,5` = `0.5`). Przecinek jest zawsze dziesiętny — `1,000` to `1`, nie tysiąc;
  spacje i twarde spacje (`1 000`) są ignorowane. Opisać w podpowiedzi pod polem.
- Dozwolone: znak `-`/`−` (U+2212 normalizowany), ułamek zwykły `a/b` (`b ≠ 0`), notacja `1e3`.
  **Niedozwolone:** `%`, jednostki, wyrażenia. Jednostkę autor wpisuje w treści pytania.
- Wynik musi być skończony (`Number.isFinite`); `NaN`/`Infinity` ⇒ odpowiedź błędna (0), nie wyjątek.
- Tolerancja `absolute | relative`, `value ≥ 0`. Dla `answer = 0` tolerancja względna ⇒ walidacja prosi o bezwzględną.
- Porównanie: `|x − a| ≤ tol + ε`, gdzie `ε = 1e-9·max(1,|a|)` (żeby `0,1+0,2`-podobne artefakty nie dawały fałszywych błędów przy tolerancji 0).

---

## 2. Model danych

### 2.1 Migracja

`netlify/database/migrations/20261019120000_question_config.sql`

```sql
-- Per-type payload for question types that do not fit the options table (numeric, ordering,
-- matching, cloze). NULL for the four original types, so existing rows need no backfill.
ALTER TABLE questions
  ADD COLUMN config JSONB CHECK (config IS NULL OR jsonb_typeof(config) = 'object');
```

Bez indeksu (kolumna czytana razem z wierszem). Netlify aplikuje migrację przy deployu; **Vercel nie** — po
merge trzeba uruchomić `env -u DATABASE_URL node --env-file=.env.local scripts/migrate.mjs`, patrz
[db-sync.md](db-sync.md).

### 2.2 Kształty `config` per typ

Wejście (`quiz_create`, edytor, plik JSON) i zapis różnią się tylko tym, że `id` doklejane są przy zapisie (D5).

```ts
// numeric
{ answer: number, tolerance?: { kind: 'absolute' | 'relative', value: number } }

// ordering — elementy w POPRAWNEJ kolejności (tak je wpisuje autor)
{ items: { id: string, text: string }[] }                       // 2..20 elementów

// matching — para to jedno poprawne dopasowanie
{ pairs: { id: string, rightId: string, left: string, right: string }[] }   // 2..12 par

// cloze — treść pytania zawiera {{1}}, {{2}}…; luka = pozycja w tablicy (bez id)
{ gaps: { answers: string[] }[] }                               // 1..20 luk, 1..10 odpowiedzi na lukę
```

Reguły walidacji (w `validate`/`configSchema` danego typu):

- `ordering`: ≥2 elementy, niepuste teksty ≤ 300 znaków. Duplikaty dozwolone (D10).
- `matching`: ≥2 pary, niepuste `left`/`right`. Duplikaty `right` (kilka lewych stron o tym samym tłumaczeniu) dozwolone (D10).
- `cloze`: znaczniki `{{n}}` w treści = dokładnie luki `1..n` (każdy raz, bez dziur i nadmiarowych); każda luka ma ≥1 niepustą odpowiedź.
- `numeric`: reguły z D8.

Dla typów z `config` pole `options` musi być puste (D2).

---

## 3. Kontrakty silnika

### 3.1 Definicja typu

```ts
export interface QuestionTypeDef<TConfig = unknown> {
  label: string
  /** true = pytanie używa tabeli options (4 stare typy). */
  usesOptions: boolean
  defaultOptions: () => DraftOption[]
  /** Pusty config dla nowego pytania w edytorze. */
  defaultConfig?: () => TConfig
  /** zod schema configu (typy bez configu: brak). Błędy trafiają na ścieżkę ['config', …]. */
  configSchema?: z.ZodType<TConfig>
  /** Reguły między polami (np. znaczniki w treści = luki); null = brak błędu. */
  validate: (question: DraftQuestion<TConfig>) => string | null
  /** 0..1 — bez zmian semantyki. */
  grade: (question: GradableQuizQuestion<TConfig>, answer: Answer | undefined) => number
  /** Co wolno pokazać graczowi (bez odpowiedzi); może tasować przez `rng`. */
  playerView: (question: GradableQuizQuestion<TConfig>, rng: () => number) => { config?: unknown; options: QuizOption[] }
  /** Czytelny opis odpowiedzi gracza i poprawnych odpowiedzi (przegląd próby). */
  describe: (question: GradableQuizQuestion<TConfig>, answer: Answer | undefined) => { answerText: string; correctAnswers: string[] }
}
```

Uwagi do typowania (F10): rejestr deklarujemy jako `{ single: …, numeric: … } satisfies { [T in QuestionType]: QuestionTypeDef<any> }`
— to wymusza komplet **kluczy** (nowy typ w `QUESTION_TYPES` bez wpisu nie skompiluje się) — i eksportujemy przez cienką funkcję
`typeDef(type)` zwracającą `QuestionTypeDef<unknown>`. Kompilator nie sprawdzi jednak, że `config` jest spójnie typowany we
wszystkich metodach jednego typu, dlatego `config` parsujemy przez `configSchema` raz, na granicy (zapis, odczyt w `toGradable`),
a wewnątrz typu jest już typowany. Dodatkowo test: „każdy typ z `QUESTION_TYPES` ma przypadek w `tests/engine.test.ts`”.

`playerView` dla 4 starych typów odtwarza dzisiejsze zachowanie, **łącznie z wyjątkiem `text`**: `options: []`, żeby
akceptowane odpowiedzi nie wyciekły (`quizRepo.ts:176-183`).

### 3.2 Odpowiedź

```ts
export interface Answer {
  optionIds?: string[]
  text?: string                       // także numeric
  /** ordering: id elementów w kolejności podanej przez gracza */
  order?: string[]
  /** matching: id pary (lewa strona) -> rightId wybranej prawej strony; brak wpisu = brak dopasowania */
  pairs?: Record<string, string>
  /** cloze: numer luki ("1", "2"…) -> wpisany tekst */
  gaps?: Record<string, string>
}
```

`answerInput` w `schema.ts`:

```ts
order: z.array(z.string().max(64)).max(50).optional(),
pairs: z.record(z.string().max(64), z.string().max(64)).optional(),
gaps: z.record(z.string().max(8), z.string().max(500)).optional(),
```

`isAnswered` (D11) mieszka w `engine.ts`; `questionRenderers.tsx` i `server/routes/quizzes.ts` (licznik `answered`)
tylko go importują. `server/classes/results.ts` ma własny typ `AttemptRow.answers` — też zmienić na `Answer`.

### 3.3 Wynik

```ts
interface QuestionResult {
  // …dotychczasowe pola bez zmian…
  /** NOWE, opcjonalne: czytelna odpowiedź gracza. Brak w próbach sprzed zmiany. */
  answerText?: string
}
```

`gradeQuiz` woła `grade` i `describe` raz na pytanie; `correctAnswers` = wynik `describe` (dla starych typów dalej
teksty poprawnych opcji — wynik identyczny jak dziś, pilnuje tego test regresji); `correctOptionIds` bez zmian.
Wynik trafia do `quiz_attempts.results` w całości, więc **przegląd nie potrzebuje już definicji pytania**:

- `server/classes/results.ts` → `answer: r.answerText ?? <obecny fallback po tabeli options>`; z bazy dociąga tylko `prompt` (+ `type`, żeby zastosować `promptText`).
- `ResultView.tsx` → `givenText = result.answerText ?? <obecna logika>`; `correctLabel` z rejestru (np. `text` i `cloze`: „Akceptowane odpowiedzi”).
- `AttemptDetails.tsx` bez zmian (czyta `answer` i `correctAnswers`).

Dodatkowo `promptText(question)` w `engine.ts`: dla `cloze` zamienia `{{n}}` na `___`; używany tam, gdzie treść pytania
pokazywana jest poza graczem (F8).

### 3.4 Widok edytora a widok gracza

**Reguła wywołania:** `getQuiz(id, withAnswers)` wywołuje `playerView` (z tasowaniem) **tylko** dla `withAnswers = false`.
Dla `withAnswers = true` (edytor, `?include=answers`, `quiz_get(withAnswers)`) zwraca `config` w kolejności autora, bez tasowania —
inaczej autor widziałby w edytorze potasowane elementy. Ocena (`toGradable`) zawsze używa pełnego `config`.

`QuizQuestion` w `types.ts` dostaje `config?: unknown`, a każdy typ eksportuje dwa typy: `XEditorConfig` (z odpowiedziami)
i `XPlayerConfig` (bez). Renderer gracza i edytor zawężają `config` przez mały pomocnik z `engine.ts`. `GET /quizzes/:id?include=answers`
zwraca pełny `config` (to widok edytora; `QuizEdit.tsx` mapuje go do formularza — F1).

---

## 4. Fazy i commity

Każda faza to jeden PR (commity: kod, dokumentacja), zielone `npm run build`, `npm run lint`, `npm test`, `npm run test:ui`.

### Faza 1 — fundament + `numeric` (2–2,5 dnia)

**Cel:** `config`, opcjonalne `options`, haki rejestru, nowe pola odpowiedzi i wyniku — i od razu pierwszy typ, żeby je
sprawdzić. Stare typy: zero zmian zachowania.

| Plik | Zmiana |
| --- | --- |
| `netlify/database/migrations/20261019120000_question_config.sql` | nowa kolumna |
| `src/shared/quiz/engine.ts` | `usesOptions`, `configSchema`, `playerView`, `describe`, `defaultConfig`, `isAnswered`, `promptText`; `Answer` rozszerzone; `DraftQuestion/GradableQuestion.config`; `QuestionResult.answerText`; wpis `numeric` |
| `src/shared/quiz/schema.ts` | `options.default([])`, `config` w `questionInput` + `superRefine` z `configSchema` i limitem rozmiaru, nowe pola `answerInput`; błąd walidacji na ścieżce zależnej od typu |
| `src/shared/quiz/types.ts` | `QuizQuestion.config?`, typy configów |
| `server/quizRepo.ts` | `QuestionRow.config` (+ `SELECT … config`); `getQuiz` używa `typeDef(type).playerView(...)`; `insertQuestions` zapisuje `config` i nadaje `id`; `toGradable` przekazuje `config` |
| `server/routes/quizzes.ts` | licznik `answered` przez `isAnswered` |
| `server/classes/results.ts` | `answerText` z wyniku, fallback na dzisiejszą logikę; `promptText` |
| `src/pages/QuizEdit.tsx` | **przenosi `config` do formularza (F1)** |
| `src/features/quizzes/QuizEditor.tsx`, `quizDefaults.ts` | zmiana typu ustawia `options` albo `config`; walidator pola przekazuje `config`; osobny `ConfigEditor` per typ (dla `numeric`: odpowiedź + tolerancja) |
| `src/features/quizzes/questionRenderers.tsx` | renderer `numeric` (`Input` z `inputMode="decimal"`), `isAnswered` z engine |
| `src/features/quizzes/ResultView.tsx` | `answerText`, etykieta z rejestru (F3) |
| `data/quiz.schema.json` | `options` poza `required`; `config`; gałęzie `then` starych typów z `"required":["options"]` (F12); gałąź `numeric` |
| `server/mcp/quizTools.ts` | opis `quiz_create/update`: `config` i typ `numeric` |
| `scripts/quiz-tool.mjs` | `download` kopiuje `config` i `subject` (F2) |
| `tests/engine.test.ts`, `tests/quizSchema.test.ts`, `src/features/quizzes/*.test.tsx` | patrz niżej |

**`numeric` — testy:** `110` vs `110.0`, `0,5` vs `0.5`, `1/2`, `1e3`, `−3` (U+2212), `1 000` = `1000`, `1,000` = `1`,
tolerancja względna 1% przy 100 → 99 i 101 oraz 98 poza, tolerancja bezwzględna, `answer = 0` z tolerancją względną odrzucone
przy walidacji, `NaN`/`Infinity`/`1/0`/`5 m/s`/`50%` ⇒ 0 punktów bez wyjątku.

**Kryterium akceptacji fazy 1:**

- wszystkie dotychczasowe testy przechodzą bez zmiany oczekiwań; `npm run test:mcp` zielone;
- test regresji: dla zestawu pytań 4 starych typów `gradeQuiz` zwraca identyczne `score/percent/correct/earned/correctOptionIds/correctAnswers` jak przed zmianą (+ dodatkowo `answerText`);
- test round-trip: quiz z pytaniem `numeric` → `GET ?include=answers` → mapowanie jak w `QuizEdit` → `PUT` → ten sam `config` (F1);
- nowy quiz `single` utworzony przez MCP i przez edytor ma `config = NULL`;
- `GET /api/quizzes/:id` (gracz) dla quizów ze starych typów zwraca ten sam JSON co przed zmianą (test porównawczy), a dla `numeric` nie zawiera `answer` ani `tolerance`.

**Ryzyko fazy 1:** wyjątek `text` w `playerView` (zob. 3.1) i `getQuiz`, który dziś filtruje opcje po typie — przenosiny muszą zachować
`options: []` dla `text` w widoku gracza, inaczej akceptowane odpowiedzi wyciekną.

### Faza 2 — `ordering` (1–1,5 dnia)

- `playerView`: elementy **potasowane przez serwer** `rng`-em; jeśli wynik jest identyczny z poprawną kolejnością (dla n ≥ 2), tasujemy ponownie. Klient nie może tasować sam — dostałby poprawną kolejność w odpowiedzi HTTP.
- Odpowiedź: `order` (id w kolejności gracza). Ocena 0/1 po tekstach (D10): `order` musi być permutacją wszystkich elementów (brakujące / powtórzone / nieznane `id` ⇒ 0), a odpowiadająca jej sekwencja znormalizowanych tekstów równa się poprawnej. Zamiana dwóch identycznych elementów jest więc poprawna.
- UI: lista z przyciskami „w górę/w dół” **zamiast** drag & drop (na telefonie HTML5 DnD nie działa, biblioteka to nowa zależność); DnD później, ten sam kontrakt `order`. Edytor: lista tekstów w poprawnej kolejności, tak samo przyciski w górę/w dół.
- `describe`: `answerText` „1. …, 2. …”; `correctAnswers`: jedna pozycja z poprawną sekwencją („A → B → C”) — tak samo jak dziś `single` daje jedną pozycję.
- Testy: poprawna kolejność, zamiana sąsiednich ⇒ 0, brak odpowiedzi ⇒ 0, `order` z powtórzonym `id` ⇒ 0, zamiana dwóch identycznych elementów ⇒ poprawnie (D10), tasowanie nigdy nie zwraca kolejności poprawnej (n ≥ 2, o ile elementy nie są wszystkie identyczne — wtedy pomijamy ponowne tasowanie).

### Faza 3 — `matching` (1–1,5 dnia)

- Model: `pairs[{id, rightId, left, right}]` (F5). Gracz dostaje `lefts: [{id, text}]` w kolejności autora i `rights: [{id: rightId, text}]` potasowane; w odpowiedzi HTTP nie ma żadnego pola łączącego `id` z `rightId`.
- Odpowiedź: `pairs: { [parId]: rightId }`. Ocena (D10): `poprawne / liczba par`; para jest poprawna, gdy znormalizowany tekst wybranej prawej strony = `right` pary. Pary przetwarzane w kolejności `config.pairs`; `rightId` zużyty przez wcześniejszą parę nie liczy się drugi raz. Nieznane klucze ignorowane.
- UI: dwie kolumny; na telefonie wybór lewej, potem prawej (klik → klik), bez przeciągania; ponowne kliknięcie zajętej prawej strony przepina ją.
- `describe`: `answerText` „kot → cat; pies → dog”; `correctAnswers`: **jedna pozycja na parę** (`["kot → cat", "pies → dog"]`), bo `studentAnalysis` i `AttemptDetails` tną/łączą listę (`slice(0, 3)`, `join(' / ')`).
- Testy: wszystkie pary, połowa par, pomyłka krzyżowa (A→2, B→1) = 0 dla obu, ten sam kafelek użyty dla dwóch lewych stron (druga para nie punktuje), dwie lewe strony o identycznym `right` (`być`/`istnieć` → `be`) ocenione poprawnie w obu układach, brak w widoku gracza `id` łączącego lewą stronę z prawą (test snapshotowy).

### Faza 4 — `cloze` (1,5 dnia)

- Model: treść z `{{1}}…{{n}}`, `config.gaps[{answers[]}]` (F7).
- `playerView`: `prompt` bez zmian, `config: { gaps: n }` (tylko liczba luk).
- Normalizacja: wspólna funkcja `normalizeText` w `engine.ts` (trim, `toLocaleLowerCase`, zwinięcie wielu spacji do jednej, `normalize('NFC')`) — używa jej też `text`; diakrytyki **nie** są usuwane (w polskim mają znaczenie). Zmiana dla `text` (zwijanie spacji) jest kompatybilna wstecz.
- UI: treść renderowana jako tekst Reacta z polami `<Input>` w miejscu znaczników (żadnego `dangerouslySetInnerHTML`); edytor: treść + tabela luk z akceptowanymi odpowiedziami i podglądem; przycisk „wstaw lukę” wstawia kolejny znacznik.
- Ocena proporcjonalna po lukach; `describe`: `answerText` „1: went; 2: learnt”; `correctAnswers`: **jedna pozycja na lukę** (`["1: went", "2: learnt / learned"]`, warianty łączone ` / `), z tego samego powodu co w `matching`; `promptText` zamienia znaczniki na `___` w przeglądach (F8).
- Testy: 2/3 luk, warianty (`learnt`/`learned`), luka pusta = 0, znacznik bez luki i luka bez znacznika odrzucone, podwójna spacja, wielkość liter.

### Faza 5 — dokumentacja i domknięcie (0,5 dnia)

- `docs/question-types.md`: sekcja „stan: zrobione” + tabela typów z linkami do implementacji; **poprawić punkt o `schemaVersion`** (zasada 4 tego planu) i usunąć `categorization`/`expression`/`hotspot`/`open` z listy „do zrobienia teraz”.
- `CLAUDE.md`: akapit o `config`, `playerView`/`describe`, `answerText`, punktacji i regule „widok gracza tasuje serwer”.
- `docs/mcp-clients.md`: lista typów w opisie narzędzi (opis pochodzi z `quizTools.ts`, więc tylko weryfikacja).
- `scripts/quiz-tool.mjs`: komentarz/test, że `upload` i `download` przenoszą `config` (naprawa w fazie 1).

Razem: **ok. 7–9 dni** (pierwotne 6–7 nie uwzględniało edycji istniejących quizów, widoku wyniku gracza i edytorów
konfiguracji — to one zajmują najwięcej czasu).

---

## 5. Wpływ na istniejące funkcje

| Obszar | Wpływ | Działanie |
| --- | --- | --- |
| Generator czasowników (`server/verbQuizBuilder.ts`) | produkuje `text`/`single` | bez zmian; `config` = `NULL` |
| Powtórki Leitnera (`reviewsRepo.applyResults`) | czyta `correct: boolean` i `verb_id` | bez zmian; nowe typy nie mają `verb_id` |
| Słabe czasowniki, „Powtórz błędne” (`retry-wrong`) | j.w. | bez zmian |
| Streak / cel dzienny (`progress.recordActivity`) | liczy „answered” | przez wspólne `isAnswered` (D11) |
| Losowanie próbki (`sampling.ts`, `resolveGradedIds`) | działa na `questionIds` | bez zmian; `shuffleOptions` dalej dotyczy tylko `single/multiple` (`QuizPlayer.prepareQuestions`) |
| CSV klasy (`csv.ts`) | liczy procenty | bez zmian |
| `studentAnalysis.hardestQuestions` | używa `prompt` i `correctAnswers` | `promptText` + wypełnione `correctAnswers` (F4, F8) |
| Przegląd próby ucznia/admina (`results.ts`, `AttemptDetails`) | czytają `answer`/`correctAnswers` | `answerText` z wyniku (D6) |
| Widok wyniku gracza (`ResultView.tsx`) | sam składa odpowiedź | `answerText` + etykieta z rejestru (F3) |
| Edycja quizu (`QuizEdit.tsx`, `QuizEditor.tsx`) | mapują tylko `options` | przenoszą `config` (F1) |
| CLI (`scripts/quiz-tool.mjs`) | `download` składa pytania pole po polu | kopiuje `config` i `subject` (F2) |
| MCP (`quiz_create`, `quiz_update`, `quiz_schema`) | schemat z `data/quiz.schema.json`, opis typów w `quizTools.ts` | aktualizacja opisu i schematu po każdej fazie |
| Vercel/Neon | nowa migracja | `scripts/migrate.mjs` po deployu (db-sync.md) |

---

## 6. Testy

Poziom 1 — jednostkowe (`npm test`, `node:test`, bez bazy):
`tests/engine.test.ts` (ocena, walidacja i `describe` każdego typu, przypadki brzegowe liczb, duplikatów i kolejności;
regresja 4 starych typów; „każdy typ z `QUESTION_TYPES` ma komplet haków”),
`tests/quizSchema.test.ts` (zod ↔ JSON Schema: te same dokumenty akceptowane/odrzucane przez oba — dopisujemy przypadki
dla każdego typu, w tym `single` bez pola `options`, `numeric` z niepustymi `options`, `cloze` z nadmiarowym znacznikiem).

Poziom 2 — UI (`npm run test:ui`):
renderer każdego nowego typu (wpisanie, kolejność, dopasowanie, luki), `isAnswered`, `ResultView` z `answerText`,
`QuizEditor` — zmiana typu na/z typu z `config`, round-trip formularza (F1).

Poziom 3 — integracja:
`scripts/mcp-local-e2e.ts` (`npm run test:mcp`): `quiz_create` z jednym pytaniem każdego nowego typu → ocena **przez REST**
(`quiz_grade` nie istnieje, F16) → sprawdzenie, że widok gracza nie zawiera odpowiedzi → `quiz_get(withAnswers)` →
`quiz_update` bez zmian → ten sam wynik. `tests/integration/db.test.ts` (`npm run test:integration`): zapis i odczyt `config`.

Poziom 4 — ręczny smoke na Vercel: quiz z 5 typami, telefon (klawiatura numeryczna, brak drag & drop, przeglądy wyniku).

---

## 7. Kryteria akceptacji całości

1. Stary quiz (`data/quiz-lista-choice.json`, `data/quiz-pierwiastki.json`) importuje się i ocenia identycznie.
2. Quiz wygenerowany dla czasowników działa bez zmian, `config` pozostaje `NULL`.
3. `GET /api/quizzes/:id` (bez `?include=answers`) nigdy nie zawiera: `isCorrect`, `explanation`, `config.answer`,
   `config.tolerance`, `config.pairs[].right` powiązanego z `left` (brak wspólnego identyfikatora), `config.items`
   w poprawnej kolejności, `config.gaps[].answers`.
4. Każdy nowy typ ma test oceny dla: odpowiedzi poprawnej, częściowo poprawnej (gdzie ma sens), pustej, błędnej.
5. Przegląd próby (gracz, nauczyciel, admin) pokazuje czytelną odpowiedź i poprawną odpowiedź dla wszystkich typów, także po edycji quizu.
6. Edycja istniejącego quizu z nowym typem nie gubi `config` (UI **i** `quiz-tool download/upload`).
7. `npm run build`, `npm run lint`, `npm test`, `npm run test:ui`, `npm run test:mcp` zielone.
8. Migracja zaaplikowana lokalnie i na Neon; deploy Vercel zielony.

---

## 8. Ryzyka i mitygacje

| Ryzyko | Mitygacja |
| --- | --- |
| wyciek odpowiedzi w `playerView` | test snapshotowy „gracz nie widzi odpowiedzi” dla wszystkich typów (w tym brak wspólnych `id` w `matching`); przegląd `playerView` w code review |
| tasowanie po stronie klienta zdradza kolejność | wyłącznie serwer (`rng` wstrzykiwany do `playerView`), wymuszone ponowne tasowanie, gdy wynik = poprawna kolejność |
| `PUT /quizzes/:id` regeneruje `id` elementów `config` (jak dziś `options`) | udokumentowane (D5); ocena używa definicji z chwili oceniania, a wynik próby trzyma `answerText` i `correctAnswers`, więc przegląd nie zależy od późniejszej edycji |
| nierozróżnialne kafelki (duplikaty) | ocena po znormalizowanym tekście (D10), duplikaty dozwolone |
| `cloze` z błędną składnią `{{n}}` | walidacja przy zapisie + test; edytor wstawia znaczniki sam |
| utrata `config` przy edycji / eksporcie | `QuizEdit.tsx`, `quiz-tool.mjs download`, testy round-trip |
| drag & drop na telefonie | przyciski „w górę/w dół”; DnD jako późniejsze ulepszenie |
| dwa hostingi | brak uploadu plików w tym zakresie |
| rosnące `quiz_attempts.results` | `answerText` to krótki string, nie definicja pytania |
| rozjazd zod ↔ JSON Schema | istniejący test porównawczy + przypadki dla każdego typu |

---

## 9. Poza zakresem (świadomie)

- `open` (trzeci stan próby, korekta przez nauczyciela/AI),
- `expression` (CAS, porównanie symboliczne),
- `hotspot` (obrazy, magazyn plików),
- `categorization` (po `matching` — ten sam mechanizm, ale wiele-do-jednego; osobny przyrost),
- materiał wspólny / `quiz_passages` (osobny projekt, wymaga decyzji o losowaniu grup pytań),
- jednostki w `numeric` (autor wpisuje jednostkę w treści pytania),
- przeciąganie (DnD) w `ordering`/`matching`.

Każdy z tych punktów wymaga własnego dokumentu; ten plan ich nie blokuje, bo fundament (`config`, `playerView`/`describe`,
rozszerzony `Answer`, `answerText`) jest dla nich wystarczający.
