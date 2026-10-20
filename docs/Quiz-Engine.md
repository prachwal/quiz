---
tags:
  - docs
  - quiz
  - frontend
  - backend
created: 2026-10-19
updated: 2026-10-20
---

# Silnik quizów

## Typy pytań

Rejestr w `src/shared/quiz/engine.ts`: `single`, `multiple`, `truefalse`, `text`,
`numeric`, `ordering`, `matching`, `cloze`.

Każdy typ definiuje: `usesOptions`, `defaultOptions`/`defaultConfig`, `validate`,
`grade`, `playerView`, `describe`.

## Normalizacja odpowiedzi

Porównania tekstowe idą przez `normalizeText`: NFC, trim, zwinięcie spacji,
złożenie typograficznych znaków interpunkcyjnych i `toLocaleLowerCase`.

- Składane: `’ ‘ ʼ \`` → `'`, `“ ” „` → `"`, `– — ‑ −` → `-`.
- **Nietknięte:** polskie diakrytyki (`szkoły` ≠ `szkoly`) i kolejność znaków.

Powód: klawiatura telefonu (iOS „smart punctuation”) zamienia apostrof i myślnik
na znaki typograficzne, więc `don’t` musi być tym samym co `don't`. Dotyczy to
wszystkich typów porównywanych po tekście (`text`, `cloze`, `ordering`,
`matching`) — jednej definicji, więc nie da się ich rozjechać.

## `cloze` — znaczniki i limity

- Znacznik ma jedną definicję (`CLOZE_MARKER` / `clozeParts` w `engine.ts`):
  `{{n}}`, gdzie `n ≥ 1` **bez zer wiodących**. `{{01}}` nie jest znacznikiem,
  bo gracz wysłałby odpowiedź pod kluczem `"01"`, a ocena czyta `"1"` — pytanie
  byłoby nie do rozwiązania. Walidacja odrzuca taką treść.
- Ograniczenia luki (te same w `validate` i w `data/quiz.schema.json`): 1–10
  akceptowanych odpowiedzi, każda 1–200 znaków i co najmniej jeden znak inny
  niż spacja.
- Limity są egzekwowane tylko przy zapisie (`validate`), nie przy odczycie:
  `clozeConfig` służy też ocenie i widokowi gracza, więc zaostrzenie go
  sprawiłoby, że starsze pytania dawałyby 0 punktów.

## Grading

- Wyłącznie server-side (`gradeQuiz`).
- Frontend dostaje widok gracza (`playerView`) bez odpowiedzi/poprawnej kolejności.
- `GET /api/quizzes/:id` pomija `isCorrect`, wyjaśnienia i opcje pytań tekstowych;
  `?include=answers` zwraca widok edytora.

## Obrazy w treści (`media:`)

Jedyny zapis obrazu: `![opis](media:<uuid>)` w jednym wierszu, uuid małymi literami. To nie jest
Markdown: bez pogrubień, linków i HTML. Parser jest czysty (`src/shared/media/richText.ts`:
`parseRichText`, `extractMediaIds`, `imageSyntaxErrors`); zewnętrzny adres `https://…` jest odrzucany,
plik najpierw trzeba wysłać do magazynu (`media_upload`, `media_upload_from_url` albo edytor).

| Pole | Obraz | Uwagi |
| --- | --- | --- |
| `prompt` pytania | tak | także `cloze`, jeśli numery luk `{{n}}` są poza obrazem |
| `explanation` | tak | widoczne w wyniku |
| tekst opcji `single`, `multiple`, `truefalse` | tak | opcja złożona tylko z obrazu to kafelek z obrazem; ocena po id opcji |
| tekst opcji `text` | **nie** | to akceptowane odpowiedzi porównywane tekstem |
| pary `matching`, elementy `ordering` | **nie** | porównanie po tekście |
| luki `cloze`, odpowiedź `numeric` | **nie** | odpowiedzi są porównywane tekstem albo liczbą |
| `lessons.intro` | tak | do 2000 znaków; reguły jak w pytaniach (`src/shared/quiz/lessonIntro.ts`) |

- **Opis (alt)** jest wymagany: 1–200 znaków. Pusty opis (albo złożony z samych spacji) jest odrzucany przy zapisie
  (`imageSyntaxErrors`) i w JSON Schema (`data/quiz.schema.json`, wzorzec z negatywnym lookahead).
- **Limity:** najwyżej 3 obrazy w jednym polu i 100 odwołań w quizie. `{{n}}` wewnątrz opisu obrazu
  nie jest luką.
- Walidacja „gdzie wolno” działa w `validate` typu pytania; JSON Schema jej nie sprawdza (znana luka
  parytetu, test `KNOWN PARITY GAP` w `tests/quizSchema.test.ts`), ani istnienia pliku.
- **Odwołania:** `syncRefs` (`server/media/repo.ts`) zapisuje `media_refs` w tej samej transakcji co quiz
  (`owner_kind` `quiz`, dla lekcji `lesson`, dla ilustracji czasownika `verb`); usunięcie quizu je czyści.
  Nieistniejący albo nie-gotowy plik daje 400 (REST) albo błąd narzędzia (MCP).
- **Odczyt:** odpowiedzi z treścią dostają mapę `media` (`{id: {url, width, height}}`, tylko pliki `ready`);
  zapis w treści się nie zmienia, więc zmiana adresu publicznego nie wymaga edycji quizów. Widoki tekstowe
  (listy podejść, analizy, MCP) pokazują `[obraz: opis]` bez adresu (`promptText`).
- **Renderowanie:** wyłącznie przez `RichText` (`<span>` i `MediaImage`), bez `dangerouslySetInnerHTML`;
  adres spoza allowlisty (`src/features/media/trustedUrl.ts`) pokazuje znacznik „Obraz niedostępny”.

## Dodawanie typu

1. `QUESTION_TYPES` + wpis w `questionTypes`.
2. Renderer w `src/features/quizzes/questionRenderers.tsx`.
3. Gałąź w `OptionsEditor`/`ConfigEditor`.
4. Gałąź w `data/quiz.schema.json`.
5. Testy w `tests/engine.test.ts` + `tests/quizSchema.test.ts`.

## Play settings

- `shuffle_questions` (NULL = ustawienie gracza, true/false wymusza).
- `shuffle_options`, `sample_size` (10/20/30 lub NULL).
- Helpers: `src/shared/quiz/sampling.ts`.
- `QuizPlayer.prepareQuestions` próbk/tasuje po stronie klienta i wysyła `questionIds`;
  server ocenia dokładnie te (`resolveGradedIds`).

## Generowane quizy

- `server/irregularVerbs.ts` buduje z katalogu czasowników; `kind='generated'`,
  `source` (`irregular-verbs`/`course-exam`).
- Ukryte z `GET /api/quizzes`, nigdy nie czyszczone.

## Powiązane

- [[question-types]]
- [[question-types-plan]]
