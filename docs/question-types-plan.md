# Plan wdrożenia: nowe typy pytań (fundament + `numeric` → `cloze`)

Dokument wykonawczy do [question-types.md](question-types.md). Tam jest uzasadnienie biznesowe i lista pomysłów;
tutaj są **decyzje, kolejność commitów, kontrakty i kryteria akceptacji** — na tyle konkretne, żeby zacząć bez
dodatkowych ustaleń.

Zasady, których plan pilnuje:

1. **Zgodność wsteczna.** Stare quizy (4 typy, `options`) i quizy generowane (`server/irregularVerbs.ts`) muszą
   działać bez migracji danych i bez zmiany zachowania.
2. **Ocena wyłącznie na serwerze.** `gradeQuiz` zostaje jedynym miejscem oceniania; frontend nie dostaje odpowiedzi.
3. **Jeden pionowy przekrój na przyrost.** Każdy typ przechodzi całą ścieżkę: schemat → baza → edytor → gracz →
   ocena → przegląd próby → JSON Schema → MCP, z testami.
4. **Bez `schemaVersion` w pierwszej iteracji.** Zgodność zapewnia to, że `options` zostaje dla starych typów,
   a `config` jest nowym, opcjonalnym polem. Wersjonowanie dopiero przy pierwszej zmianie niekompatybilnej.
5. **Bez własnego magazynu plików.** Dwa hostingi (Netlify + Vercel/Neon) nie dzielą Blobs; multimedia tylko jako
   zewnętrzny URL. Upload — osobny projekt po decyzji o hostingu.

---

## 1. Decyzje projektowe

| # | Decyzja | Uzasadnienie |
| --- | --- | --- |
| D1 | `questions.config jsonb NULL` obok `options` | starych pytań nie ruszamy; `jsonb` mieści wszystko, czego potrzebują nowe typy |
| D2 | `options` staje się **opcjonalne** (`default([])`), ale wymagane warunkowo dla 4 starych typów | walidacja per typ i tak siedzi w rejestrze (`questionTypes[type].validate`) |
| D3 | Rejestr dostaje `playerView(question)` | usuwa łańcuch `if (type === …)` z `quizRepo.getQuiz` i trzyma wiedzę o typie w jednym pliku |
| D4 | Odpowiedzi nowych typów są **identyfikatorowe** (`id` generowane przy zapisie), nie tekstowe | duplikaty tekstów (dwa razy „być”, dwie identyczne daty) nie mogą się mieszać; tekst wyciekałby kolejność |
| D5 | `id` elementów `config` = `crypto.randomUUID()` nadawane w `insertQuestions`, gdy brak | nie da się odgadnąć poprawnej kolejności z samego indeksu |
| D6 | Przegląd próby: serwer dokłada `answerText` (czytelny string) | zero zmian w `AttemptDetails`/`StudentResultsView`; stary format `results` czyta się dalej |
| D7 | Punktacja: `cloze` i `matching` proporcjonalnie, `ordering` całość (0/1) | luki i pary są niezależne; kolejność jest jedna, częściowe punkty mylą uczniów |
| D8 | `numeric`: przecinek lub kropka, ułamki `a/b`, notacja `1e3`, tolerancja bezwzględna **lub** względna; **bez jednostek** w pierwszej wersji | parsowanie `"5 m/s"` to źródło fałszywych błędów; jednostkę można dopisać w treści pytania |
| D9 | `open`, `expression`, `hotspot` poza zakresem | `open` zmienia model oceny (trzeci stan próby), `expression` wymaga CAS, `hotspot` magazynu plików |

### Konsekwencje D2, które trzeba wdrożyć razem

`options` jest dziś wymagane w pięciu miejscach — wszystkie w jednym commicie fundamentu:

- `src/shared/quiz/schema.ts` — `options: z.array(optionInput).max(20)` → `.default([])`
- `data/quiz.schema.json` — `required: ["type","prompt","options"]` → bez `options`; `if/then` dla 4 starych typów wymaga `minItems`
- `src/shared/quiz/engine.ts` — `DraftQuestion.options` / `GradableQuestion.options` zostają, ale mogą być `[]`
- `server/quizRepo.ts` — `insertQuestions` iteruje po `question.options` (pusta tablica = brak wstawień, działa)
- `src/features/quizzes/quizDefaults.ts` — `emptyQuestion` ustawia `options` tylko dla starych typów

---

## 2. Model danych

### 2.1 Migracja

`netlify/database/migrations/20261019120000_question_config.sql`

```sql
-- Per-type payload for question types that do not fit the options table (numeric, ordering,
-- matching, cloze). NULL for the four original types, so existing rows need no backfill.
ALTER TABLE questions ADD COLUMN config JSONB;
```

Bez indeksu (kolumna czytana razem z wierszem). Netlify aplikuje migrację przy deployu; **Vercel nie** — po
merge trzeba uruchomić `env -u DATABASE_URL node --env-file=.env.local scripts/migrate.mjs`, patrz
[db-sync.md](db-sync.md).

### 2.2 Kształty `config` per typ

```ts
// numeric
{ answer: number, tolerance?: { kind: 'absolute' | 'relative', value: number } }

// ordering — elementy w poprawnej kolejności; id nadawane przy zapisie
{ items: { id: string, text: string }[] }

// matching — para to jedno poprawnie dopasowanie
{ pairs: { id: string, left: string, right: string }[] }

// cloze — treść pytania zawiera {{id}}; gaps w kolejności
{ gaps: { id: string, answers: string[] }[] }
```

`config` jest walidowane **w rejestrze** (`validate`), nie w zod — zod tylko przepuszcza obiekt o ograniczonym
rozmiarze (`z.record(z.string(), z.unknown())`). Dzięki temu reguły per typ są w jednym miejscu z oceną.

---

## 3. Kontrakty silnika

### 3.1 `QuestionTypeDef`

```ts
export interface QuestionTypeDef<TConfig = unknown> {
  label: string
  /** true = pytanie używa tabeli options (4 stare typy). */
  usesOptions: boolean
  defaultOptions: () => DraftOption[]
  /** Pusty config dla nowego pytania w edytorze. */
  defaultConfig?: () => TConfig
  /** null = brak błędu. */
  validate: (question: DraftQuestion & { config?: TConfig }) => string | null
  /** 0..1 — bez zmian semantyki. */
  grade: (question: GradableQuestion & { config?: TConfig }, answer: Answer | undefined) => number
  /** Co wolno pokazać graczowi (bez odpowiedzi). */
  playerView: (question: StoredQuestion) => { config?: unknown; options?: QuizOption[] }
  /** Czytelny opis odpowiedzi i poprawnych odpowiedzi do przeglądu próby. */
  describe: (question: StoredQuestion, answer: Answer | undefined) => { answerText: string; correctText: string }
}
```

Typ `QuestionTypeDef` przestaje być `Record<QuestionType, …>` bez generyków — generyk jest opcjonalny, więc stare
wpisy się nie zmieniają. TypeScript wymusi uzupełnienie nowych pól dla każdego typu (to jest cały mechanizm
„dodanie typu = jedno miejsce").

### 3.2 Odpowiedź

```ts
export interface Answer {
  optionIds?: string[]
  text?: string
  /** ordering: id elementów w kolejności podanej przez gracza */
  order?: string[]
  /** matching: id pary -> id prawej strony; brak wpisu = brak dopasowania */
  pairs?: Record<string, string>
  /** cloze: id luki -> tekst */
  gaps?: Record<string, string>
}
```

`answerInput` w `schema.ts` dostaje te trzy pola z limitami:

```ts
order: z.array(z.string().max(64)).max(50).optional(),
pairs: z.record(z.string().max(64), z.string().max(64)).optional(),
gaps: z.record(z.string().max(64), z.string().max(500)).optional(),
```

Odpowiedź „czy pytanie zostało w ogóle wypełnione” wymaga dwóch zmian: `isAnswered` w
`src/features/quizzes/questionRenderers.tsx` oraz licznik `answered` w `server/routes/quizzes.ts`
(dziś `a?.optionIds?.length || a?.text?.trim()`) muszą rozpoznawać `order`, `pairs` i `gaps`.

### 3.3 Wynik

Do `QuestionResult` dochodzą dwa **nowe** pola, stare zostają nietknięte (stare wiersze w jsonb czytają się dalej):

```ts
answerText?: string
correctText?: string
```

`questionDetails` w `server/classes/results.ts` przy budowie `StudentAttemptQuestion` korzysta z `describe`
**zapisanego przy ocenie** (`answerText`/`correctText` trafiają do `quiz_attempts.results`).
Dzięki temu przegląd nie potrzebuje już definicji pytania — działa nawet po edycji quizu.

Uwaga: `questionDetails` dziś dociąga `prompt` i teksty opcji z bieżących tabel. Dla nowych typów `answerText`
przyjdzie z zapisanych `results`, więc zostaje tylko `prompt`.

---

## 4. Fazy i commity

Każda faza to jeden commit (lub dwa: kod + dokumentacja), zielone `npm run build`, `npm run lint`, `npm test`.

### Faza 0 — fundament (1,5–2 dni)

**Cel:** `config`, opcjonalne `options`, hook `playerView`, nowe pola odpowiedzi i wyniku. **Zero nowych typów.**

| Plik | Zmiana |
| --- | --- |
| `netlify/database/migrations/20261019120000_question_config.sql` | nowa kolumna |
| `src/shared/quiz/engine.ts` | `usesOptions`, `playerView`, `describe`, `defaultConfig`; `Answer` rozszerzone; `DraftQuestion.config` |
| `src/shared/quiz/schema.ts` | `options.default([])`, `config` w `questionInput`, nowe pola `answerInput` |
| `src/shared/quiz/types.ts` | `QuizQuestion.config?`, `QuizOption` bez zmian |
| `server/quizRepo.ts` | `QuestionRow.config`; `getQuiz` używa `...questionTypes[type].playerView(...)`; `insertQuestions` zapisuje `config` i nadaje `id`; `toGradable` przekazuje `config` |
| `server/classes/results.ts` | `StudentAttemptQuestion` z `answerText`/`correctText` (fallback na dzisiejsze zachowanie) |
| `data/quiz.schema.json` | `options` opcjonalne + `config` w `additionalProperties` i `required` per typ |
| `src/features/quizzes/QuizEditor.tsx`, `quizDefaults.ts` | wybór typu ustawia `options` albo `config` |
| `server/mcp/quizTools.ts` | opis `quiz_create` wspomina `config` (bez listy nowych typów — jeszcze ich nie ma) |
| `tests/engine.test.ts`, `tests/quizSchema.test.ts` | regresja 4 typów: identyczne wyniki, identyczna walidacja |

**Kryterium akceptacji fazy 0:** wszystkie 187 testów przechodzi bez zmian oczekiwań; `npm run test:mcp` zielone;
nowy quiz `single` utworzony przez MCP i przez edytor ma `config = null`; `GET /api/quizzes/:id` (gracz) zwraca
dokładnie to samo, co przed zmianą (snapshot JSON porównany testem).

**Ryzyko fazy 0:** `getQuiz` zwraca dziś `options: []` dla `text` w widoku gracza. Po przejściu na `playerView`
trzeba zachować ten wyjątek w `text.playerView`, inaczej odpowiedzi tekstowe wyciekną.

### Faza 1 — `numeric` (0,5 dnia)

Nauka pionowego przekroju przy minimalnym UI — jedno pole tekstowe.

- `engine.ts`: `validate` (liczba skończona, tolerancja ≥ 0), `grade` (parsowanie `,`→`.`, `a/b`, `1e3`, `%`),
  `playerView` (usuwa `answer` i `tolerance`), `describe`.
- `schema.ts` / `data/quiz.schema.json`: `config.answer` liczba, `config.tolerance` opcjonalna.
- Edytor: pole „Poprawna odpowiedź”, „Tolerancja” + przełącznik bezwzględna/względna.
- Renderer: `Input` z `inputMode="decimal"` (klawiatura numeryczna na telefonie).
- Testy: `110` vs `110.0`, `0,5` vs `0.5`, `1/2`, `1e3`, tolerancja względna 1% przy 100 → 99 i 101, `NaN` odrzucone.

### Faza 2 — `ordering` (1 dzień)

- Model: `config.items[{id,text}]`; gracz dostaje elementy **potasowane** (serwer tasuje w `playerView`, żeby nie
  dało się odczytać kolejności z odpowiedzi).
- UI: lista z przyciskami „w górę/w dół” **zamiast** drag & drop. Powód: na telefonie HTML5 DnD nie działa,
  a biblioteka to nowa zależność. Drag & drop można dodać później jako ulepszenie (ten sam kontrakt `order`).
- Ocena 0/1, `describe` pokazuje „1. …, 2. …”.
- Testy: poprawna kolejność, jedna para zamieniona → 0, brak odpowiedzi → 0, duplikaty tekstów rozróżnione po `id`.

### Faza 3 — `matching` (1 dzień)

- Model: `config.pairs[{id,left,right}]`; gracz dostaje `left` w kolejności i `right` potasowane, oba z `id`.
- UI: dwie kolumny; na telefonie wybór lewej, potem prawej (klik → klik), bez przeciągania.
- Ocena proporcjonalna: `poprawne pary / liczba par`.
- `describe`: „kot → cat; pies → dog”.
- Testy: wszystkie pary, połowa par, pomyłka krzyżowa (A→2, B→1) = 0 dla obu, pary z identycznym tekstem po prawej
  rozróżnione po `id`.

### Faza 4 — `cloze` (1 dzień)

- Model: `prompt` z `{{gapId}}`, `config.gaps[{id, answers[]}]`; `answers` to warianty akceptowane (jak przy `text`).
- `playerView`: `prompt` bez zmian, `config` tylko z samymi `id` luk (bez odpowiedzi).
- UI: renderowanie treści z polami w miejscu `{{…}}`; edytor: treść + tabela luk i akceptowanych odpowiedzi.
- Ocena proporcjonalna po lukach; normalizacja jak w `text` (trim, lower-case).
- Testy: 2/3 luk, warianty (`learnt`/`learned`), luka pusta = 0, nadmiarowe `{{}}` odrzucone przy walidacji.

### Faza 5 — dokumentacja i domknięcie (0,5 dnia)

- `docs/question-types.md`: sekcja „stan: zrobione” + tabela typów z linkami do implementacji.
- `CLAUDE.md`: akapit o `config`, `playerView` i punktacji.
- `docs/mcp-clients.md`: lista typów w opisie narzędzi (opis pochodzi z `quizTools.ts`, więc tylko weryfikacja).
- `scripts/quiz-tool.mjs`: eksport/import obsługuje `config` (dziś przepuszcza dowolny obiekt zgodny ze schematem —
  sprawdzić testem).

Razem: **ok. 6–7 dni**.

---

## 5. Wpływ na istniejące funkcje

| Obszar | Wpływ | Działanie |
| --- | --- | --- |
| Generator czasowników (`server/verbQuizBuilder.ts`) | produkuje `text`/`single` | bez zmian; `config` = `null` |
| Powtórki Leitnera (`reviewsRepo.applyResults`) | czyta `correct: boolean` | bez zmian; typy złożone też dają `correct` |
| Słabe czasowniki (`weakVerbs`) | j.w. | bez zmian |
| Streak / cel dzienny (`progress.recordActivity`) | liczy „answered” po `optionIds`/`text` | dodać nowe pola do `isAnswered` |
| Losowanie próbki (`sampling.ts`, `resolveGradedIds`) | działa na `questionIds` | bez zmian |
| CSV klasy (`src/shared/quiz/csv.ts`) | liczy procenty | bez zmian |
| MCP (`quiz_create`, `quiz_update`) | schemat pytań w opisie | aktualizacja opisu po każdej fazie |
| Vercel/Neon | nowa migracja | `npm run db:migrate` po deployu |

---

## 6. Testy

Poziom 1 — jednostkowe (`npm test`, `node:test`, bez bazy):
`tests/engine.test.ts` (ocena i walidacja każdego typu, w tym przypadki brzegowe liczb i duplikatów),
`tests/quizSchema.test.ts` (zod ↔ JSON Schema: te same pliki odrzucane przez oba).

Poziom 2 — UI (`npm run test:ui`):
renderer każdego nowego typu (wpisanie, kolejność, dopasowanie, luki), `isAnswered`, przegląd próby z `answerText`.

Poziom 3 — integracja MCP (`npm run test:mcp`):
utworzenie quizu z jednym pytaniem każdego nowego typu, ocena przez `quiz_grade`… (jeśli narzędzia nie ma, przez
REST), sprawdzenie, że widok gracza nie zawiera odpowiedzi (`config` bez `answer`/`answers`/`right`).

Poziom 4 — ręczny smoke na Vercel: quiz z 4 typami, telefon (klawiatura numeryczna, brak drag & drop).

---

## 7. Kryteria akceptacji całości

1. Stary quiz (`data/quiz-lista-choice.json`, `data/quiz-pierwiastki.json`) importuje się i ocenia identycznie.
2. Quiz wygenerowany dla czasowników działa bez zmian, `config` pozostaje `null`.
3. `GET /api/quizzes/:id` (bez `?include=answers`) nigdy nie zawiera: `isCorrect`, `explanation`,
   `config.answer`, `config.tolerance`, `config.pairs[].right`, `config.items` w kolejności, `config.gaps[].answers`.
4. Każdy nowy typ ma test oceny dla: odpowiedzi poprawnej, częściowo poprawnej, pustej, błędnej.
5. Przegląd próby pokazuje czytelny opis dla wszystkich typów, także po edycji quizu.
6. `npm run build`, `npm run lint`, `npm test`, `npm run test:ui` zielone.
7. Migracja zaaplikowana lokalnie i na Neon; deploy Vercel zielony.

---

## 8. Ryzyka i mitygacje

| Ryzyko | Mitygacja |
| --- | --- |
| wyciek odpowiedzi w `playerView` | test snapshotowy „gracz nie widzi odpowiedzi” dla wszystkich typów; przegląd `playerView` w code review |
| `PUT /quizzes/:id` regeneruje `id` elementów `config` (jak dziś `options`) | udokumentowane; ocena i tak używa definicji z chwili oceniania, a próby trzymają teksty |
| duplikaty tekstów w `matching` / `ordering` | identyfikatory w `config` (D4/D5) |
| `cloze` z błędną składnią `{{}}` | walidacja przy zapisie + test |
| drag & drop na telefonie | przyciski „w górę/w dół”; DnD jako późniejsze ulepszenie |
| dwa hostingi | brak uploadu plików w tym zakresie |
| długi `config` psuje `quiz_attempts.results` | `describe` zapisuje teksty przy ocenie, nie definicje |

---

## 9. Poza zakresem (świadomie)

- `open` (trzeci stan próby, korekta przez nauczyciela/AI),
- `expression` (CAS, porównanie symboliczne),
- `hotspot` (obrazy, magazyn plików),
- `categorization` (po `matching` — to ten sam mechanizm z grupami; osobny przyrost),
- materiał wspólny / `quiz_passages` (osobny projekt, wymaga decyzji o losowaniu grup pytań).

Każdy z tych punktów wymaga własnego dokumentu; ten plan ich nie blokuje, bo fundament (`config`, `playerView`,
rozszerzony `Answer`) jest dla nich wystarczający.
