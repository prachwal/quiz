---
tags:
  - plan
  - quiz
  - backend
  - frontend
  - deploy
  - testing
  - status/in-progress
created: 2026-10-20
updated: 2026-10-20
---

# Faza 5.C — samodzielny cykl orkiestracji (naprawy granic → Preview → promocja)

> Plan jednego pełnego cyklu, który ma dwa cele równorzędne: **(1)** domknąć naprawy granic modułów z [[Architecture-Audit]] (24 naruszenia → lista wyjątków pusta poza dwoma znanymi), **(2)** posłużyć jako ćwiczenie orkiestracji wielu subagentów: poznać możliwości Haiku, nauczyć się dzielić pracę i zlecać zadania agentowi. Dziennik doświadczeń prowadzony jest na bieżąco w sekcji [Dziennik](#dziennik-orkiestracji). Powiązane: [[Learning-Slice-Plan]], [[Roadmap]].

## Role

| Rola | Kto | Co robi | Czego NIE robi |
| --- | --- | --- | --- |
| **Orkiestrator** | Sonnet (sesja główna) | pisze specyfikacje, dzieli pracę, scala gałęzie, uruchamia bramki, decyduje o przejściu do następnej fazy, wdraża | nie pisze kodu produktu (drobne dokumenty i scalanie tak) |
| **Wykonawca** | Haiku (`haiku-coder`) | implementuje jeden dokładnie opisany krok, jeden commit na krok, raportuje przez `SubagentHandback` | nie decyduje o zakresie, nie ruszy bazy ani migracji |
| **Recenzent** | Haiku (osobna instancja, tylko do odczytu) | czyta cały diff fazy z listą kontrolną i zgłasza ryzyka | nie poprawia kodu, nie widzi raportu wykonawcy przed własną oceną |
| **QA** | Haiku + orkiestrator | uruchamia skrypty przeglądarkowe i zbiera asercje; zrzuty ogląda orkiestrator | nie ocenia wyglądu |

Zasada zaufania: **raport agenta jest hipotezą**. Po każdej fazie orkiestrator sam uruchamia bramkę i czyta ryzykowne fragmenty diffu (SQL, auth, usuwanie, kolejność skutków ubocznych).

## Bramki

- **Bramka lokalna** (`npm run gate`, tworzona w fazie 0): lint (0 ostrzeżeń), `tsc -b`, `tsc -p tsconfig.server.json`, `npm test` (w tym kanarek architektury), `npm run build`, `npm run build:api`, `npm run test:ui`, `test:mcp` pod `flock` z kontrolą portu 8888. Wersja szybka (`gate:fast`): bez build, test:ui i test:mcp.
- **Bramka fazy** = bramka lokalna zielona **na zmergowanym drzewie** + kanarek: liczba wpisów na liście wyjątków **maleje** (zapadka) + zgodność z listą „co ma zniknąć" w specyfikacji fazy.
- **Bramka Preview**: wdrożenie `Ready`, `GET /api/health`, kontrole bez logowania (401 / 404), z tokenem osobistym: `tools/list` (52 narzędzia), odczyty REST i MCP, `media_upload_from_url` na prawdziwym adresie, zrzuty kluczowych stron ze zmiennymi środowiska Preview.
- **Bramka promocji**: wszystkie powyższe zielone + brak nierozwiązanych znalezisk recenzenta + plan wycofania gotowy.

## Fazy

| Faza | Zakres | Wykonawcy | Równolegle? | Bramka na wyjściu |
| --- | --- | --- | --- | --- |
| **0. Przygotowanie** — **zrobione** (`7f7a7f9`) | `scripts/gate.sh` + `npm run gate`, `gate:fast`; kalibracja Haiku na małym zadaniu | 1 × Haiku | nie | gate działa na czystym drzewie |
| **1. Trzy niezależne naprawy** (worktree, rozłączne pliki) — **zrobione** (1A `36def7b`, 1B `9d8dc6b`, `b084eb0`, 1C `d2da517`, `4127921`; Q2 CI i bramka `8470b5b`, `64bbde5`; scalenia `450cd0b`, `bfb1a42`, `db5d02a`, `ea2102c`) | **1A** frontend sloty: `ResultView` bierze slot (`ProgressLine`, odświeżanie postępu) z `QuizPlay`; `VerbSlide`/`VerbTable` biorą slot `badge` z `Verbs`/`LessonView` (usuwa `f-quizzes→f-progress` ×2, `f-learning→f-progress` ×2). **1B** platforma: `Viewer`/`viewerOf`/`canReadClasses` z `classAccess` do `server/viewer.ts`; schematy tokenów i uwag z `shared/quiz/schema.ts` do `src/shared/platform/` (usuwa `mcp-platform→classes` ×3, `platform→shared-quizzes`, `f-platform→shared-quizzes` ×3, `mcp-platform→shared-quizzes`). **1C** media i próby: narzędzia mediów dostają od korzenia funkcję opisującą właścicieli (zamiast `quizRepo`), `attemptsRepo` bez importu z klas (usuwa `media→quizzes`, `quizzes→classes` ×2 i wyjątek twardej reguły) | 3 × Haiku | **tak** (3 worktree) | po scaleniu: bramka lokalna + wpisy zniknęły |
| **2. Przesunięcie granicy quizy/nauka/postęp** (jeden wykonawca, jedna gałąź — te same pliki) — **zrobione** (`6df3156` testy charakteryzujące, `addd37a` 2A, `0d880c1` 2B) | **2A** rejestr zdarzenia „lekcja ukończona" w nauce; powtórki i seria rejestrują się w module postępu (`progressGradeHooks`, `lessonCompletedHooks`), `learningGradeHooks` zostaje tylko z zaliczeniem egzaminu (usuwa `learning→progress` ×4). **2B** trasy generowania quizów z czasowników (`generate/irregular-verbs`, `retry-wrong`, powtórki) i narzędzie `verbs_list` przechodzą z modułu quizów do nauki, adresy URL bez zmian (usuwa `quizzes→learning` ×2, `quizzes→progress`) | 1 × Haiku (2 commity, kolejno) | nie | bramka lokalna + `test:mcp` bez zmian liczby przypadków |
| **3. Domknięcie** — **w toku (ten commit)** | lista wyjątków kurczy się do 2 wpisów (typy `shared-types`, znane z audytu); dokumenty; manifest | 1 × Haiku | nie | kanarek zielony, zapadka potwierdzona |
| **4. Recenzja i QA** | niezależna recenzja całego diffu 5.C (lista kontrolna poniżej); skrypty przeglądarkowe lokalnie (quiz, wynik, lekcja, tabela czasowników, edytor) na prawdziwej bazie i buckecie; porównanie z zrzutami sprzed zmian | 1 × Haiku (recenzent) + 1 × Haiku (QA) | **tak** (recenzja i QA są niezależne) | brak znalezisk blokujących |
| **5. Preview** | `git push vercel-neon`, czekanie na build, bramka Preview | orkiestrator | nie | bramka Preview |
| **6. Promocja** | `vercel --prod --yes`, weryfikacja produkcji (health, bundle, MCP przez konektor, cron), plan wycofania: `vercel rollback` do wdrożenia `f1e7a5kzf` | orkiestrator | nie | produkcja zielona |

### Lista kontrolna recenzenta (faza 4)

1. Czy któryś adres URL, metoda, kod odpowiedzi albo JSON odpowiedzi się zmienił? (powinno: nie)
2. Czy kolejność skutków ubocznych przy ocenie quizu i ukończeniu lekcji jest ta sama (egzamin → zapis → powtórki → aktywność)? Czy błąd haka nadal nie gubi zapisanego podejścia?
3. Czy bramki uprawnień (`write:quizzes`, `manage:classes`, `manage:users`) zostały przeniesione razem z kodem?
4. Czy nie dodano re-eksportów, które odtwarzają usunięte krawędzie, i czy nie pojawił się kod martwy?
5. Czy lista wyjątków jest tylko mniejsza, a wpisy usunięte, a nie obejście (np. przez `any`/`require`)?
6. Czy testy dotykają zmienionych zachowań, czy tylko przeszły przez przypadek?

### Rozwiązywanie konfliktów przy scalaniu (faza 1)

- `scripts/arch-allowlist.json` jest generowany: po scaleniu **zawsze** `node scripts/arch-audit.mjs --print-allowlist > scripts/arch-allowlist.json`.
- `api/index.mjs` jest generowany: po scaleniu `npm run build:api`, nigdy ręcznie.
- Agenci **nie** edytują `docs/Roadmap.md` ani `CLAUDE.md` (wpisy zbiera orkiestrator).

## Ryzyka i plan wycofania

| Ryzyko | Skutek | Zabezpieczenie |
| --- | --- | --- |
| Zmiana kolejności skutków ubocznych oceny | utrata serii/powtórek | recenzja (pkt 2) + `test:mcp` + test jednostkowy rejestru |
| Przeniesione trasy zmieniają adres | zepsuty klient | lista kontrolna pkt 1, `test:mcp` woła te same adresy |
| Konflikty scalania w worktree | stracony czas | rozłączne pliki, generowane pliki odtwarzane |
| `test:mcp` na wspólnej bazie z dwoma agentami | skasowane dane testowe | `flock`, filtr właściciela |
| Wdrożenie psuje produkcję | przerwa | `vercel rollback` do `f1e7a5kzf`; baza bez migracji w tym cyklu |

## Poza zakresem tego cyklu

Przenoszenie plików do `server/modules/*` i `src/features/*` oraz podział `shared/quiz/types.ts` (5.D, nie w tym cyklu; do tego czasu zostają dwa wpisy `shared-types` i jeden cykl `shared-quizzes`/`shared-types`), Biblioteka obrazów, `media_view`, test `media_upload_from_url` na Vercelu (wymaga tokenu), włączenie `MEDIA_URL_FETCH` na Production.

## Metryki do dziennika

Dla każdego zadania: czas, liczba tokenów i wywołań narzędzi (z powiadomienia o zakończeniu), czy sprawdzenia przeszły przy pierwszym podejściu, liczba odstępstw od specyfikacji, znaleziska recenzenta, przeróbki wykonane przez orkiestratora.

## Dziennik orkiestracji

| Faza / zadanie | Agent | Czas | Tokeny | Wywołania | Pierwsze podejście zielone? | Odstępstwa | Wnioski |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 / skrypt bramki | Haiku (`haiku-coder`) | 6 min 46 s | 85,5 tys. | 11 | tak (pełna bramka 4 min 44 s: PASS) | 5 drobnych (m.in. dodatkowe wymaganie kodu wyjścia 0, katalog tymczasowy z pułapką EXIT) | Zadanie kalibracyjne wypadło bardzo dobrze. **Moja specyfikacja była wewnętrznie sprzeczna** (kazałem dodać sekcję w dokumencie, który „już ją ma", i jednocześnie dopisać wiersz do CLAUDE.md): agent rozstrzygnął to rozsądnie i opisał w odstępstwach. Odmowa uprawnień dla kontroli bazy po `test:mcp`: agent jej nie obchodził i zostawił mi — dobra postawa. Wniosek: czytać własne zlecenie pod kątem sprzeczności zanim je wyślę. |
| 1A / sloty frontendu | Haiku, worktree | 23 min 53 s | 141 tys. | 69 | częściowo: kod i testy tak, bramka pełna nie (porty zajęte przez innego agenta, timeouty `test:ui` przy obciążeniu 17–23) | 5: jeden commit zamiast dwóch (zapadka listy wyjątków), brak mocków w istniejących testach, builder kolumn w `VerbTable` | Zapadka wymusza jeden commit razem z listą wyjątków. Moja specyfikacja zakładała mocki `progress` w testach, których nie było: **sprawdzać fakty przed wysłaniem**. Agent poprawnie zatrzymał się na odmowie uprawnień przy `test:mcp`. |
| 1B / platforma (viewer, schematy) | Haiku, worktree | 33 min 4 s | 125 tys. | 48 | tak, po 4 przebiegach bramki (porty, timeouty UI) | 6: rozszerzył zakres o strażników klas (`classGuards.ts`), zmienił `EXPECTED_CYCLES`, poprawił dwa testy | Spec nie wymieniał strażników klas ani plików testowych: agent rozszerzył zakres w sposób ograniczony i **opisał**. Najlepszy wzorzec: gdy spec rozmija się z kodem, zrób minimum i zgłoś. |
| 1C / media i próby | Haiku, worktree | 40 min 22 s | 129 tys. | 53 | częściowo: test:mcp 368 PASS, `test:ui` padał na timeoutach 5 s | 3: test jednostkowy narzędzia mediów niewykonalny (pg w pakiecie), więc czysty helper `ownerNames.ts` | Wymagany test „wstrzyknięcia” był niewykonalny w runnerze testów (import `pg`). Agent wydzielił czystą funkcję i opisał, zamiast udawać pokrycie. **Moja sprzeczność:** „nie commituj bundla” vs „zacommituj bundle”. |
| Q2 / CI i bramka | Haiku, worktree | 5 min 12 s | 101 tys. | 36 | tak (na atrapach) | 3: zadanie `e2e-mcp` z `if: false` zamiast komentarza, per-job permissions, `bash -c` dla hooka | Najczystszy przebieg: jasno rozdzielone „twarde limity” (czego nie uruchamiać). **Ale:** zgubił `MCP_E2E_ALLOW_REMOTE_DB=1` z domyślnego polecenia (mój zapis specyfikacji), co wykryła dopiero moja pełna bramka. |
| Inwentarz danych (poza cyklem) | Haiku | 3 min 56 s | 136 tys. | 21 | tak | 2 | Zadanie czysto odczytowe, jeden plik wyjściowy, oddzielił fakty od niewiadomych. |
| 2 / hook lekcji + trasy generowania | Haiku, main (sekwencyjnie, 3 commity) | 27 min 27 s | 182 tys. | 40 | tak po poprawkach własnych (bundle niezacommitowany, jedna nieudana przenosiny narzędzi) | 6: pole `lessons_completed` (nie `lessons`), kolejność narzędzi w `tools/list`, `courseId` liczone w gałęzi, rozszerzone sprzątanie e2e | **Wzorzec „testy charakteryzujące najpierw” zadziałał**: 12 przypadków e2e przeszło identycznie przed i po (380 PASS), a ja sprawdziłem handlery diffem — **generowanie i `retry-wrong` identyczne z oryginałem co do znaku**. Agent wykrył błędy w mojej specyfikacji (kolumna `lessons_completed`, kolejność „bramka → commit” niemożliwa dla commita serwerowego z bundlem, nieaktualna tabela naruszeń w dokumencie). |

### Zaplanowane zmiany specyfikacji (z rozpoznania przed fazą 2)

- **Pułapka lokalizacji tras generowania:** gałąź `onlyWeak` używa `reviews.weakVerbs` (postęp), więc trasy `generate/irregular-verbs` i `retry-wrong` trafiają do modułu **postępu** (nie nauki), a `verbs_list` i `verb_set_image` z `quizTools.ts` do `lessonTools.ts` (nauka).

### Wnioski z integracji fazy 1 (orkiestrator)

1. **Pełna bramka na scalonym drzewie złapała dwa błędy, których żadna gałąź nie widziała:** (a) stała `EXPECTED_CYCLES` była edytowana przez dwie gałęzie, a prawdziwy stan po scaleniu był trzeci; (b) Q2 zgubił zmienną środowiskową e2e. Bramka w gałęzi to za mało — **bramka orkiestratora po scaleniu jest obowiązkowa**.
2. **Pliki generowane nie scalają się tekstowo**: po scaleniu 1B i 1C bundle `api/index.mjs` różnił się od świeżo zbudowanego, mimo że git nie zgłosił konfliktu. Reguła „odtwarzaj, nie scalaj” się potwierdziła.
3. **Równoległość zadziałała, ale nie za darmo:** trzy zadania zajęły łącznie ok. 97 min pracy agentów w ok. 40 min zegarowych (przyspieszenie ok. 2,4×), kosztem kolizji na wspólnych portach i timeoutów UI. Spec powinien zakładać, że bramka pełna w worktree jest *best effort*.
4. **Specyfikacja jako kod:** błędy były we mnie (sprzeczność o bundlu, nieprawdziwe założenie o mockach, brak nazwania plików testowych i stałych dzielonych między gałęziami). Lista kontrolna do wysłania zlecenia: (a) czy każdy fakt zweryfikowany, (b) czy jest sprzeczność z regułami wspólnymi, (c) które pliki edytuje więcej niż jedna gałąź, (d) co agent ma zrobić przy odmowie.
