---
tags:
  - plan
  - quiz
  - backend
  - frontend
  - mcp
  - media
  - learning
  - status/todo
created: 2026-10-19
updated: 2026-10-20
---

# Kolejność operacji — plan nadrzędny

> Jedna kolejność dla czterech planów: [[Learning-Slice-Plan]] (podział na slice'y), [[Media-Storage-Plan]] (obrazy w S3), [[MCP-Admin-Tools]] (narzędzia admina) i uwag z przeglądu kodu. Zasada: najpierw to, co jest wspólnym wymaganiem lub kasuje błędy w plikach, które potem przenosimy; strukturalne przenoszenie plików na końcu. Stan sprawdzony w historii gita 2026-10-19.

## Stan wyjściowy

| Obszar | Zrobione | Zostaje |
| --- | --- | --- |
| Narzędzia admina MCP | `itemStats`, `attemptsRepo`, `attempt_list`, `attempt_get` (kroki 1–3) | `quiz_stats`, `user_*`, `audit_list`/`feedback_*`/`settings_*`/`system_stats`, dokumentacja; decyzje D1–D4 |
| Cloze | F1–F4 (znacznik, znaki typograficzne, limity, przecinek), D1 (końcowa kropka w lukach) | |
| Uwagi z przeglądu | `key` w graczu, TLS i pula, zabezpieczenie `test:mcp`, odsyłacz do `quiz_schema`, kolejność w `ordering`/`matching` ujawniała odpowiedź, `withShownOrders` liczył nietknięte pytania, brak limitu długości `id` w `config` (faza 0) | nic |
| Podział nauki | nic | kroki 1–8 |
| Obrazy (S3) | nic (plan) | M0–M6, L1–L2, S1–S2 |

## Zasady kolejności

1. **Najpierw poprawki błędów, potem przenoszenie plików.** Błędy leżą w `engine.ts`, `QuizPlayer.tsx`, `schema.ts`; krok 6 podziału dzieli i przenosi te pliki, więc poprawka po przeniesieniu kosztuje więcej.
2. **Zależności twarde przed miękkimi:** `server/db.ts` przed modułem `media`; przebudowa handlera `grade` przed dopisaniem do niego migawki pytań.
3. **Migracja addytywna przed kodem, który z niej czyta.** Vercel nie stosuje migracji przy wdrożeniu: `npm run db:migrate`, potem wdrożenie.
4. **Dwa pliki, jedna zmiana naraz.** `ResultView`, `QuizPlayer`, `routes/quizzes.ts` i `api.ts` dotykają jednocześnie podział i obrazy; kolejne zmiany w tych plikach idą po sobie, nie równolegle.
5. **Nowe narzędzia MCP paczkami.** Każda zmiana listy narzędzi wymaga odświeżenia konektora w klientach (zob. [[mcp-clients]]), więc narzędzia dodajemy w kilku wydaniach, nie po jednym.
6. **Każda faza kończy się stanem wydawalnym:** zielone `npm run lint`, `npm test`, `npm run test:ui`, `npm run build`, po zmianach serwera `npm run build:api` i `MCP_E2E_ALLOW_REMOTE_DB=1 npm run test:mcp`, wdrożenie podglądu na Vercelu.

## Graf zależności

```
Faza 0 (poprawki)
   │
   ├────────────── M0 spike (równolegle, wymaga człowieka: CLI Neona)
   ▼                │
Faza 1: db.ts ──────┤
   ▼                │
Faza 2: grade event → UI bez nauki → injectEndpoints
   ▼                │
Faza 3: migawka pytań → quiz_stats → user_* → audit/feedback/settings
   ▼                │
Faza 4: media M1 → M2 → M3 → M4 → M5 → M6 ← bramka po M0
                    L1 ← klasy przez API nauki (krok 5) → L2 → S1 → S2
   ▼
Faza 5: przeniesienie plików → granice → (schemat: nie robić)
```

## Fazy

### Faza 0 — poprawki w istniejącym kodzie (około 1 dzień)

Przed czymkolwiek strukturalnym; małe, niezależne, każde z testem.

| # | Zadanie | Decyzja |
| --- | --- | --- |
| 0.1 | **`ordering`/`matching`: jedna poprawka, trzy objawy (zrobione).** `withShownOrders` wstrzykuje do wysyłanej odpowiedzi układ widoczny na ekranie dla nietkniętych pytań `ordering` (także przy ocenie, [QuizPlayer.tsx:140](../src/features/quizzes/QuizPlayer.tsx#L140)); serwer liczy je jako udzielone (seria, cel dzienny, `quiz_attempts.answers`), a `shuffleAwayFrom` gwarantuje, że ten układ nigdy nie jest układem autora, więc takie pytanie zawsze dostaje 0. Poprawka: przestać wstrzykiwać (nietknięte = nieodpowiedziane), tasować jednostajnie, a `isAnswered` liczy tylko faktycznie ułożoną odpowiedź | **D-A:** tak (zrobione) |
| 0.2 | limity długości `id` w `config` dla `ordering` i `matching` w `validate` (JSON Schema ma 64) i test zgodności zod ↔ JSON Schema (zrobione) | brak (zrobione) |
| 0.3 | cloze D1: końcowa interpunkcja w lukach (zrobione) | **D-B:** tak, tylko dla `cloze` (zrobione) |

Dlaczego tu: wszystkie siedzą w `QuizPlayer.tsx`, `engine.ts` i `schema.ts`, które później dzieli i przenosi krok 6.

### Faza 1 — fundament (około 0,5 dnia + M0)

| # | Zadanie | Uzasadnienie |
| --- | --- | --- |
| 1.1 | **Podział, krok 1:** `pool` do `server/db.ts` (11 importów + `quizRepo`), bez re-eksportu z `quizRepo` (zrobione) | wymaga go `media` (M1) i migawka pytań; mechaniczny, bez zmiany zachowania |
| 1.2 | **M0 (spike):** bucket Neon, skrypt `scripts/media-smoke.ts`, odpowiedzi na niewiadome 1–5 z [[Media-Storage-Plan]] | równolegle z fazami 2–3, bo wymaga logowania CLI i czasu człowieka; wynik decyduje o dostawcy przed M1 |

### Faza 2 — rozcięcie sprzężenia quizy ↔ nauka (około 2–3 dni)

| # | Zadanie | Uzasadnienie |
| --- | --- | --- |
| 2.1 | **Krok 2:** zdarzenie po ocenie (`beforeSave`/`afterSave`); `learning` i `progress` rejestrują obsługę | przebudowuje handler `grade`, w którym później dopisujemy migawkę pytań |
| 2.2 | **Krok 3:** `ResultView` z `outcome`/`backLink`, `QuizPlayer` bez wpisanego `/learn/…` | zanim M4 dopisze tam obrazy |
| 2.3 | **Krok 4:** `api.injectEndpoints` per moduł | zanim `media` doda endpointy; unika dopisywania do 366-linijkowego `api.ts` |

Po fazie 2 produkt jest nietknięty dla użytkownika, a jądro quizów nie zna kursów.

### Faza 3 — narzędzia admina (około 4–5 dni)

| # | Zadanie | Zależność |
| --- | --- | --- |
| 3.1 | **Decyzje D1–D4** z [[MCP-Admin-Tools]] (domyślnie: tylko OAuth, migawka pytań A, `class_transfer`, bez e-maila w liście podejść) | przed 3.2 |
| 3.2 | migracja `quiz_attempts.questions_snapshot` + zapis w `saveAttempt` (w fazie `beforeSave` z 2.1) + częściowe uzupełnienie istniejących wierszy | po 2.1 |
| 3.3 | **`quiz_stats`** (`itemStats` + `attemptsOfQuiz` + snapshot) | po 3.2; wydanie 1 narzędzi (razem z 3.4) |
| 3.4 | `user_results`, `user_analysis` (cała historia użytkownika bez klasy — to one odpowiadają na pytanie, od którego zaczął się [[MCP-Admin-Tools]]; read path z `classes.allAttempts` i `analyzeStudent`) | niezależne od 3.2 |
| 3.5 | `user_list`, `user_get`, `user_search`, `user_roles_set`, `user_block` z zabezpieczeniami przeniesionymi z REST | niezależne |
| 3.6 | `class_transfer` (D3-A: walidacja roli nowego właściciela, audyt starego i nowego) | po rozstrzygnięciu D3 |
| 3.7 | `audit_list`, `feedback_list`, `feedback_update`, `settings_get`, `settings_set`, `system_stats` | niezależne |
| 3.8 | dokumentacja (`mcp.md`, `mcp-clients.md`, `CLAUDE.md`), podbicie `version` serwera | po 3.3–3.7 |
| 3.9 | *(opcjonalnie)* `quiz_duplicate` | — |

Faza dodaje **15 narzędzi** (16 z opcjonalnym `quiz_duplicate`): `quiz_stats` 1, `user_results`/`user_analysis` 2, `user_*` 5, `class_transfer` 1, operacyjne 6. Narzędzia 3.3–3.7 wypuszczamy **jednym wydaniem**, żeby klienci odświeżyli konektor raz.

### Faza 4 — obrazy w quizach i lekcjach (około 8 dni)

Rozpoczyna się po rozstrzygnięciu M0.

| # | Zadanie | Uwagi |
| --- | --- | --- |
| 4.1 | **M1** fundament: migracja `media`/`media_refs`, sterownik S3 i atrapa, `sniff` | `db.ts` z 1.1 |
| 4.2 | **M2** zapis `![opis](media:…)`, walidacja „gdzie wolno”, `syncRefs` | `promptText` z cloze (już po D1) |
| 4.3 | **M3** mapa `media` w odpowiedziach | po 2.3: endpointy przez `injectEndpoints` |
| 4.4 | **M4** renderowanie: `RichText`, `MediaImage`, `ChoiceTile`, `Cloze`, wynik, lekcja | po 2.2 |
| 4.5 | **M5** narzędzia MCP do wysyłania (`media_upload`, `media_upload_from_url`, …) | najpierw testy `ssrf`; wydanie 2 narzędzi |
| 4.6 | **M6** wysyłanie w edytorze (`ImageUpload`) | po M4 |
| 4.7 | **Podział, krok 5:** klasy czytają postęp lekcji przez API nauki | przed L1, żeby narzędzia lekcji lądowały na ustalonym API |
| 4.8 | **L1** wstęp lekcji, **L2** ilustracje czasowników | `lesson_get`/`lesson_update`/`verb_set_image` w wydaniu 3 narzędzi |
| 4.9 | **S1** sprzątanie (Cron), **S2** dokumentacja i `.env.example` | na końcu |

### Faza 5 — przeniesienie plików (około 2–3 dni)

| # | Zadanie | Uwagi |
| --- | --- | --- |
| 5.1 | **Krok 6:** `server/modules/*`, `src/features/*`, podział `shared/quiz/` i `types.ts` | jeden duży, mechaniczny diff; `media` jest już w docelowym kształcie, narzędzia admina przenosimy razem z resztą |
| 5.2 | **Krok 7:** granice (`no-restricted-imports` albo `dependency-cruiser`) i test-kanarek | po przeniesieniu, inaczej reguły padają od razu |
| — | **Krok 8** (schemat `course_exams`) | nie robić do czasu drugiego rodzaju egzaminu |

## Licznik narzędzi MCP

Plany podają przyrosty, nie liczby bezwzględne, bo zależą od kolejności faz. Przy kolejności z tego dokumentu: dziś 27 → po fazie 3 **42** → po M5 **49** → po L1 **51** → po L2 **52**. Każdy commit, który dodaje narzędzia, aktualizuje asercję w `scripts/mcp-local-e2e.ts` i liczbę w `docs/mcp-clients.md`.

## Zacommitowany bundle `api/index.mjs`

Plik musi zostać w repo: Vercel wykrywa funkcje w `api/` przed buildem, więc bundle musi istnieć przed wdrożeniem ([[vercel]]). Konflikt przy równoległej pracy jest jednak pewny (każda zmiana serwera go przebudowuje). Reguła: **nigdy nie rozwiązywać konfliktu ręcznie** — wybrać dowolną stronę i przebudować `npm run build:api` po scaleniu; opcjonalnie `.gitattributes` z `api/index.mjs -diff` skraca przeglądy. Do rozważenia osobno: mniejszy bundle (zależności jako `--external`) zmniejsza i diff, i zimny start.

## Wydania i migracje

| Wydanie | Zawartość | Migracje (przed wdrożeniem) | Odświeżenie konektora MCP |
| --- | --- | --- | --- |
| R1 | faza 0 | brak | nie |
| R2 | fazy 1–2 | brak | nie |
| R3 | 3.2–3.8 | `questions_snapshot` | **tak** (narzędzia admina) |
| R4 | 4.1–4.4, 4.6 (obrazy w UI, bez MCP) | `media`, `media_refs` | nie |
| R5 | 4.5 (MCP do wysyłania obrazów) | — | **tak** |
| R6 | 4.7–4.9 (lekcje, sprzątanie) | `irregular_verbs.image_media_id` | **tak** (narzędzia lekcji) |
| R7 | faza 5 | brak | nie |

Zmienne środowiskowe `S3_*` i `MEDIA_*` dodać na Vercelu (Production/Preview/Development) **przed** R4 i wdrożyć ponownie, zgodnie z regułą repo.

## Decyzje potrzebne przed startem

| Kiedy | Decyzja | Domyślnie |
| --- | --- | --- |
| przed 0.1 | D-A: nie wstrzykiwać układu i tasować `ordering`/`matching` jednostajnie | tak (zrobione) |
| przed 0.3 | D-B: końcowa interpunkcja w lukach tylko w `cloze` | tak |
| przed 3.2 | D2 migawka pytań (wariant A) | A |
| przed 3.3 | D1 tokeny z `manage:users` | nie (wariant A: tylko OAuth) |
| przed 3.4 | D3 admin zmienia cudze klasy | tylko `class_transfer` |
| przed 3.3 | D4 e-mail w `attempt_list` | nie |
| przed 4.1 | dostawca magazynu (wynik M0) | Neon, jeśli M0 przejdzie, inaczej S3/R2 |
| przed 4.1 | D10: klient S3 — SDK czy własny SigV4 (wynik pomiaru z M0) | SDK, o ile przyrost bundla jest mały |
| przed 4.5 | czy `media_upload_from_url` wchodzi (SSRF) | tak, pod warunkiem pełnych zabezpieczeń |

## Szacunek (moja ocena, 1 osoba)

| Faza | Dni |
| --- | --- |
| 0 | 1 |
| 1 | 0,5 (+ 0,5 M0) |
| 2 | 2–3 |
| 3 | 5–6 (`user_results`/`user_analysis`/`class_transfer` dodają około dnia) |
| 4 | 8 |
| 5 | 2–3 |
| **Razem** | **około 19–22 dni** |

Fazy 3 i 4 są niezależne od siebie po fazie 2; przy dwóch osobach można je prowadzić równolegle. Konflikty: `scripts/mcp-local-e2e.ts` (liczba narzędzi), `docs/mcp-clients.md` i **zacommitowany bundle `api/index.mjs`** (około 3 MB, przebudowywany przy każdej zmianie serwera) — patrz niżej.

## Punkty zatrzymania

Po każdej fazie produkt jest spójny, więc plan można przerwać w dowolnym z tych miejsc:

- po fazie 0 — błędy naprawione;
- po fazie 2 — jądro quizów niezależne od nauki;
- po fazie 3 — komplet narzędzi admina;
- po fazie 4 — obrazy działają;
- po fazie 5 — struktura docelowa.

## Gdyby priorytetem była struktura

Kolejność 0 → 1 → 2 → **5** → 3 → 4 jest możliwa. Koszt: fazy 3 i 4 zaczynają od nowego układu katalogów, a pierwsza użyteczna funkcja (obrazy) opóźnia się o około tydzień. Zysk: nowy kod od razu w docelowych miejscach, bez późniejszego przenoszenia narzędzi admina.

## Powiązane

- [[Learning-Slice-Plan]] — kroki 1–8 podziału
- [[Media-Storage-Plan]] — M0–M6, L1–L2, S1–S2
- [[MCP-Admin-Tools]] — narzędzia admina i decyzje D1–D4
- [[Cloze-Fixes-Plan]] — F1–F4 i D1 (zrobione)
- [[mcp-clients]] — odświeżanie konektorów po zmianie narzędzi
