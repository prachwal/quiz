# Plan rozwoju – 5 zadań

Plan na podstawie stanu aplikacji z 2026-10-17 (commit `dab9fcc`). Zadania są ponumerowane; numeracja nie
oznacza kolejności wykonania – ta jest w sekcji „Kolejność i zależności”.

Rozmiary: **S** ≈ 0,5–1 dnia, **M** ≈ 2–3 dni, **L** ≈ 4–6 dni (jedna osoba, razem z weryfikacją).

## Podsumowanie

| # | Zadanie | Rozmiar | Zależy od | Wartość dla ucznia |
| - | ------- | ------- | --------- | ------------------ |
| 1 | Powtórki w odstępach (spaced repetition) | L | – | Bardzo wysoka |
| 2 | Seria dni i cel dzienny | M | – | Wysoka (nawyk) |
| 3 | Audio z wymową (synteza mowy) | S | – | Wysoka (szybka wygrana) |
| 4 | Słabe czasowniki i trening błędów | M | 1 | Wysoka |
| 5 | Klasy i nauczyciel | L | 2 (zalecane) | Zależy od grupy docelowej |

## Kolejność i zależności

Zalecana kolejność: **3 → 2 → 1 → 4 → 5**.

- Zadanie 3 nie dotyka bazy ani API, więc daje widoczny efekt najmniejszym kosztem.
- Zadanie 2 tworzy wspólną tabelę aktywności i profil użytkownika, z których korzystają 5 (raporty klasy).
- Zadanie 1 wprowadza powiązanie „pytanie → czasownik” i stan powtórek; zadanie 4 buduje na nich.
- Zadanie 5 jest największe i ma sens dopiero, gdy aplikacja ma służyć grupom (szkoła, korepetycje).

## Zasady wspólne dla wszystkich zadań

- **Migracje:** tylko nowe pliki w `netlify/database/migrations/` (zastosowanych migracji się nie edytuje).
  Lokalnie `npx netlify database migrations apply`; na produkcji stosuje je Netlify przy wdrożeniu.
- **Dane użytkownika:** klucz `user_id` = `sub` z Auth0 (TEXT), zgodnie z `quiz_attempts`. Cały API jest
  prywatny, więc użytkownik zawsze jest znany (`currentUserId`).
- **Uprawnienia:** nowe operacje administracyjne za uprawnieniem Auth0 (jak `manage:users`); osobiste tokeny API
  nie dostają uprawnień administracyjnych.
- **Interfejs:** komponenty Ant Design z tokenami motywu (jasny/ciemny), układ kart zamiast tabel na telefonie
  (`useMediaQuery(PHONE_QUERY)`), cele dotykowe ≥ 44 px, teksty po polsku.
- **Testy:** projekt nie ma jeszcze automatycznych testów. Przy zadaniach z logiką czystą (algorytm powtórek,
  serie dni, ranking słabych czasowników) dodać testy jednostkowe (`node:test` lub Vitest) dla funkcji bez
  zależności od bazy. Reszta: ręczna weryfikacja opisana w kryteriach akceptacji.
- **Dokumentacja:** po każdym zadaniu zaktualizować `CLAUDE.md` (architektura) i, jeśli zmieniły się zmienne
  środowiskowe, `.env.example`.
- **Wdrożenie:** `git push` na `main` buduje i wdraża Netlify; po zadaniach z migracją sprawdzić
  `netlify database status --branch production`.

---

## Zadanie 1 – Powtórki w odstępach (spaced repetition)

**Cel:** aplikacja „pamięta”, które czasowniki użytkownik zna słabo, i sama proponuje powtórkę w optymalnym
momencie, zamiast losować czasowniki za każdym razem od zera.

**Zakres**

1. **Model danych (migracja):**
   - `questions.verb_id INTEGER REFERENCES irregular_verbs(id) ON DELETE SET NULL` – generator quizów zapisuje,
     którego czasownika dotyczy pytanie (dziś ta informacja jest tylko w tekście).
   - `verb_reviews`: `user_id`, `verb_id`, `box` (lub `ease`/`interval_days`), `due_at`, `repetitions`,
     `lapses`, `attempts`, `correct`, `last_reviewed_at`; unikalny klucz `(user_id, verb_id)`; indeks
     `(user_id, due_at)`.
2. **Algorytm** (`server/spacedRepetition.ts`, funkcja czysta): uproszczony SM-2 lub pudełka Leitnera (np.
   odstępy 1 / 2 / 4 / 8 / 16 dni). Poprawna odpowiedź przesuwa dalej, błędna cofa do pierwszego odstępu i
   zwiększa `lapses`. Pytanie z częściową poprawnością traktować jak błędne.
3. **Aktualizacja po ocenie:** `POST /api/quizzes/:id/grade` dla pytań z `verb_id` aktualizuje `verb_reviews`
   (w jednej transakcji z zapisem podejścia). Quizy ręczne (bez `verb_id`) nie zmieniają powtórek.
4. **API:**
   - `GET /api/reviews/summary` → `{ dueCount, newCount, nextDueAt }`
   - `POST /api/reviews/session` `{ count }` → generuje quiz (`source: 'review'`) z czasowników, których termin
     minął (najpierw najbardziej zaległe), uzupełniając nowymi, jeśli za mało.
5. **Interfejs:** karta „Powtórka na dziś: N czasowników” na stronie głównej (z przyciskiem „Zacznij”),
   licznik w zakładce „Nauka”, stan pusty „Na dziś wszystko powtórzone”. Ukończenie lekcji (`complete`) dodaje
   jej czasowniki jako „nowe” do kolejki.

**Kryteria akceptacji**

- Po błędnej odpowiedzi czasownik pojawia się w powtórce następnego dnia; po kolejnych poprawnych odpowiedziach
  odstępy rosną (zgodnie z testami jednostkowymi algorytmu).
- Sesja powtórek nigdy nie zawiera czasowników z terminem w przyszłości (poza uzupełnieniem „nowymi”).
- Użytkownicy nie widzą swoich nawzajem powtórek (zapytania zawsze po `user_id`).
- Quizy sprzed zmiany nadal działają (kolumna `verb_id` jest nullable).

**Ryzyka:** przypisanie pytań do czasowników dotyczy tylko nowych quizów; stare podejścia nie wypełnią
powtórek. Zadanie 4 i 1 powinny dzielić tę samą tabelę statystyk.

---

## Zadanie 2 – Seria dni i cel dzienny

**Cel:** budować nawyk regularnej nauki – widoczna seria dni, dzienny cel i krótkie podsumowanie tygodnia.

**Zakres**

1. **Model danych (migracja):**
   - `user_profiles`: `user_id` (PK), `daily_goal` (domyślnie 10 pytań), `timezone` (np. `Europe/Warsaw`),
     `created_at`. Ta tabela posłuży też zadaniu 5 (etykiety użytkowników w raportach klasy).
   - `daily_activity`: `user_id`, `day` (DATE w strefie użytkownika), `answered`, `correct`, `lessons_completed`;
     klucz `(user_id, day)`.
2. **Zliczanie:** `grade` dodaje liczbę odpowiedzi i poprawnych, `lessons/:id/complete` zwiększa
   `lessons_completed` (upsert `ON CONFLICT DO UPDATE`). Dzień liczony w strefie z profilu (fallback UTC).
3. **Logika serii** (`server/streaks.ts`, funkcje czyste): bieżąca seria (dzień „aktywny” = osiągnięty cel lub
   choć jedna odpowiedź – do ustalenia), najdłuższa seria, status „dziś jeszcze nie ćwiczyłeś”.
4. **API:** `GET /api/progress/summary` → `{ currentStreak, longestStreak, today: {answered, goal}, last7:[…] }`;
   `PATCH /api/progress/goal` `{ dailyGoal }` (np. 5/10/20/30).
5. **Interfejs:** chip z płomieniem i serią w nagłówku, pierścień postępu dziennego na stronie głównej,
   mini-kalendarz 7 dni na stronie Wyniki, wybór celu w Ustawieniach; komunikat gratulacyjny po osiągnięciu celu.
   Przy pierwszym wejściu zapisać strefę czasową przeglądarki (`Intl.DateTimeFormat().resolvedOptions()`).

**Kryteria akceptacji**

- Aktywność o 23:50 i o 00:10 czasu użytkownika liczy się jako dwa różne dni, niezależnie od strefy serwera.
- Seria przerywa się po pełnym dniu bez aktywności i nie przerywa się w dniu bieżącym przed końcem doby.
- Zmiana celu natychmiast zmienia pierścień na stronie głównej.
- Testy jednostkowe: przejście przez zmianę czasu (DST), pusta historia, jeden dzień, luka.

**Ryzyka:** definicja „aktywnego dnia” wpływa na odbiór (cel czy jedna odpowiedź) – warto ustawić w
konfiguracji, nie na sztywno.

---

## Zadanie 3 – Audio z wymową (synteza mowy)

**Cel:** każda forma czasownika może zostać odczytana (np. *read /red/*, *bought*, *wrote*), bez dodawania plików
audio ani zewnętrznych usług.

**Zakres**

1. **Hook i przycisk:** `src/features/audio/useSpeech.ts` (obsługa `speechSynthesis`, asynchroniczne ładowanie
   głosów przez `voiceschanged`, wybór głosu `en-GB` / `en-US`, szybkość) oraz komponent `SpeakButton` (ikona
   głośnika, stan „odtwarza”, `aria-label`). Gdy przeglądarka nie ma głosu angielskiego – przycisk się nie
   pokazuje.
2. **Miejsca użycia:** slajd lekcji (bezokolicznik, past simple, past participle i zdanie przykładowe),
   wynik quizu (poprawne odpowiedzi), strona „Czasowniki” (przycisk przy wierszu/karcie).
   Odczyt form z wariantami (`learnt / learned`) – kolejno, z krótką przerwą.
3. **Ustawienia:** w `settingsSlice` (zapis w localStorage jak pozostałe opcje): akcent (US/UK), tempo
   (0,8× / 1× / 1,2×), „odtwarzaj automatycznie po zmianie slajdu” (domyślnie wyłączone).
4. **Mobilne:** odtwarzanie tylko po geście użytkownika (wymóg iOS Safari); autoodtwarzanie wyłączone na
   urządzeniach, które go blokują.
5. *(Opcjonalnie, osobno)* kolumna `ipa` w `verb_forms` i wyświetlanie transkrypcji – wymaga zebrania danych.

**Kryteria akceptacji**

- Na desktopie (Chrome, Firefox, Safari) i telefonach (iOS Safari, Android Chrome) przycisk odczytuje
  poprawnie wszystkie formy, a brak głosu nie powoduje błędu ani pustego miejsca w układzie.
- Kliknięcie drugi raz przerywa odtwarzanie; zmiana slajdu przerywa poprzedni odczyt.
- Ustawienia akcentu i tempa zapisują się po odświeżeniu strony.

**Ryzyka:** jakość i dostępność głosów zależą od systemu użytkownika. Jeśli to będzie problemem, rozważyć
wstępnie wygenerowane pliki audio (osobne zadanie).

---

## Zadanie 4 – Słabe czasowniki i trening błędów

**Cel:** użytkownik widzi, których czasowników najczęściej nie zna, i może ćwiczyć tylko je.

**Zależność:** zadanie 1 (powiązanie pytań z czasownikami i tabela `verb_reviews` ze statystykami
`attempts`/`correct`/`lapses`). Nie tworzyć drugiej tabeli statystyk.

**Zakres**

1. **Dane:** zapytanie rankingowe po `verb_reviews`: czasowniki z minimum 3 podejściami, sortowane po
   odsetku błędów (a przy remisie po ostatnim błędzie). Wartość progowa i minimalna liczba podejść w stałych.
2. **API:**
   - `GET /api/progress/weak-verbs?limit=` → lista `{ verb, attempts, correct, accuracy, lastWrongAt }`
   - rozszerzenie `POST /api/quizzes/generate/irregular-verbs` o filtr `onlyWeak: true` (źródło `weak`) –
     losowanie z listy słabych czasowników, z uzupełnieniem, jeśli jest ich mniej niż pytań.
3. **Interfejs:**
   - sekcja „Najtrudniejsze dla Ciebie” na stronie Wyniki (karty/tabela: czasownik, formy, trafność, przycisk
     „Ćwicz”),
   - przełącznik „Tylko moje słabe czasowniki” w generatorze quizu na stronie głównej (nieaktywny z podpowiedzią,
     gdy brak danych),
   - znacznik „trudny dla Ciebie” przy czasowniku na stronie „Czasowniki” i na slajdzie lekcji,
   - po quizie lista pomyłek z przyciskiem „Powtórz błędne” (quiz z samych błędnych czasowników).

**Kryteria akceptacji**

- Czasownik pomylony 3 z 4 razy trafia na górę rankingu; po serii poprawnych odpowiedzi spada.
- Filtr „tylko słabe” nigdy nie zwraca czasowników bez historii podejść, chyba że to uzupełnienie
  (wtedy pytania są oznaczone jako nowe).
- Dane są ograniczone do zalogowanego użytkownika; administrator nie widzi cudzych rankingów w tym widoku.

**Ryzyka:** przy małej liczbie danych ranking jest szumem – stąd minimalna liczba podejść i komunikat
„ćwicz więcej, aby zobaczyć analizę”.

---

## Zadanie 5 – Klasy i nauczyciel

**Cel:** nauczyciel zakłada klasę, przydziela kursy i quizy z terminem i widzi postępy uczniów.

**Zakres**

1. **Role i uprawnienia (Auth0):**
   - nowa rola `teacher` i uprawnienie `manage:classes` w API „Quiz API”, przypisane roli `teacher`;
   - panel „Użytkownicy” (zakładka w Ustawieniach) obsługuje trzecią zarządzaną rolę (`MANAGED_ROLES` w
     `src/shared/quiz/types.ts` i w `server/auth0Management.ts`), z zachowaniem zabezpieczeń (ostatni admin
     itd.).
2. **Model danych (migracja):**
   - `classes` (`id`, `name`, `owner_id`, `join_code` unikalny, `archived_at`)
   - `class_members` (`class_id`, `user_id`, `joined_at`), klucz `(class_id, user_id)`
   - `assignments` (`id`, `class_id`, `kind` = `course` | `quiz`, `course_id`/`quiz_id`, `due_at`, `created_by`)
   - w `quiz_attempts` kolumna `assignment_id` (nullable), żeby powiązać wynik z zadaniem.
   - korzysta z `user_profiles` z zadania 2 (nazwa/e-mail uczniów widoczne dla nauczyciela – wymaga
     informacji dla uczniów o tym, że nauczyciel widzi ich wyniki).
3. **API:**
   - nauczyciel (`manage:classes`): CRUD klas, odnowienie kodu, dodawanie/usuwanie uczniów, przydział zadań,
     `GET /api/classes/:id/report` (uczeń × zadanie: ukończone lekcje, najlepszy wynik egzaminu, ostatnia
     aktywność, liczba słabych czasowników), eksport CSV,
   - uczeń: `POST /api/classes/join` `{ code }`, `GET /api/my/assignments` (zadania z terminami i statusem).
   - każda operacja sprawdza własność klasy (nauczyciel widzi tylko swoje klasy).
4. **Interfejs:** strona „Klasy” (dla nauczyciela: lista, szczegóły, raport, przydzielanie z datą), strona
   „Moje zadania” dla ucznia (widoczne w zakładce Nauka/Quizy), wejście do klasy kodem, oznaczenia terminów
   (zbliża się / po terminie).

**Kryteria akceptacji**

- Uczeń dołącza kodem, widzi przydzielony kurs, a po zaliczonym egzaminie status zadania zmienia się na
  „zrobione” w raporcie nauczyciela.
- Nauczyciel nie widzi danych uczniów spoza swoich klas; uczeń nie widzi cudzych wyników ani raportów.
- Archiwizacja klasy ukrywa ją w listach, ale zachowuje historię wyników.
- Zmiana roli w Auth0 działa po ponownym zalogowaniu (komunikat w panelu, jak dla pozostałych ról).

**Ryzyka:** to zadanie dotyka prywatności uczniów (RODO, w tym niepełnoletni) – przed wdrożeniem ustalić zasady
przetwarzania, informację dla użytkowników i politykę usuwania danych. Najlepiej realizować po zadaniu 2.

---

## Poza zakresem tego planu (pomysły na później)

- Pliki audio z natywną wymową i transkrypcje IPA; ćwiczenia ze słuchaniem i mówieniem (rozpoznawanie mowy).
- Kolejne zestawy czasowników (poziom C1, czasowniki frazowe) i import treści z CSV.
- Powiadomienia (e-mail / web push) przypominające o serii i powtórkach.
- Rankingi i znajomi, odznaki, osiągnięcia.
- Source mapy i alerty w Sentry, testy automatyczne E2E (patrz `docs/sentry.md`).
