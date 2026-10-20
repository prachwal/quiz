---
tags:
  - plan
  - quiz
  - security
  - deploy
  - decision
  - status/todo
created: 2026-10-20
updated: 2026-10-20
---

# Checklista gotowości komercyjnej

> Czego brakuje, żeby pobierać pieniądze za aplikację quiz (nauka + quizy + klasy + MCP) i nie narazić ani siebie, ani użytkowników. Stan sprawdzony w repozytorium 2026-10-20. **To nie jest porada prawna**: punkty z sekcji 1 trzeba skonsultować z prawnikiem lub inspektorem ochrony danych. Ceny i limity w sekcji 2 są orientacyjne i wymagają sprawdzenia w aktualnych cennikach. Kontekst: ocena poziomu komercjalizacji (≈ 2 w skali 1–5: dobry prototyp z jednym wyróżnikiem — tworzenie treści przez LLM przez MCP).

**Legenda:** ✅ jest, 🟡 częściowo, ⬜ brak. Wysiłek: **S** ≤ 1 dzień, **M** 2–5 dni, **L** ponad tydzień (lub zależny od osób trzecich). **Blokada** = bez tego nie wolno brać pieniędzy / uruchamiać dla szkół.

## 0. Najważniejsze wnioski

1. **Blokady prawne** to sekcja 1 (dane nieletnich, RODO, umowy powierzenia, transfer danych do USA). Bez nich pilotaż ze szkołą jest ryzykowny, a sprzedaż niedopuszczalna.
2. **Blokada licencyjna**: wdrożenie na Vercel **Hobby** jest tylko do użytku niekomercyjnego. Każdy płatny scenariusz wymaga planów płatnych (sekcja 2).
3. **Największa luka produktowa**: brak organizacji (szkoły, firmy), płatności i planów. Dziś izolacja jest tylko per nauczyciel.
4. **Najtańsza droga do pierwszego klienta**: korepetytorzy i małe szkoły językowe (mniej nieletnich w jednym kanale, wyższa gotowość do zapłaty, prostsze RODO) — zob. sekcja 6.
5. Dane są dziś w USA (baza Neon `aws-us-east-1`, tenant Auth0 `…us.auth0.com`); dla uczniów w UE warto przenieść do UE **zanim** pojawią się prawdziwi użytkownicy.

## 1. Prawo i dane osobowe

| # | Pozycja | Stan | Wysiłek | Blokada | Uwagi |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Role stron: kto jest administratorem danych, kto podmiotem przetwarzającym. Szkoła/nauczyciel = administrator, Ty = podmiot przetwarzający (art. 28 RODO); przy sprzedaży bezpośredniej uczniom (korepetycje) Ty = administrator | ⬜ | S (decyzja) + prawnik | tak | wpływa na wszystkie dokumenty poniżej |
| 1.2 | Rejestr czynności przetwarzania / inwentarz danych (jakie dane, po co, gdzie, kto widzi, jak długo) | 🟡 | S | tak | inwentarz z kodu w sekcji 9 (stan 2026-10-20); brakuje decyzji o retencji (9.5) i formalnego rejestru czynności |
| 1.3 | Polityka prywatności (po polsku, zrozumiała dla ucznia/rodzica) | ⬜ | S–M | tak | link w stopce i na ekranie logowania |
| 1.4 | Regulamin usługi | ⬜ | S–M | tak | zakres, odpowiedzialność, treści tworzone przez nauczycieli |
| 1.5 | Umowa powierzenia przetwarzania danych (DPA) dla szkół | ⬜ | M | tak (dla szkół) | wzór + zasady dla podwykonawców |
| 1.6 | Umowy powierzenia z dostawcami (Auth0, Vercel, Neon, Sentry) i lista podwykonawców | ⬜ | S | tak | zwykle akceptowane w panelach dostawców; wpisać do rejestru |
| 1.7 | **Transfer danych poza EOG**: Neon `us-east-1`, Auth0 tenant w USA, Sentry (region zależy od projektu), Vercel (region funkcji: sprawdzić) | 🟡 | M–L | zalecane przed produkcją | EU-region dla bazy i Auth0 lub podstawa prawna (SCC / certyfikacja DPF); migracja bazy to osobny projekt |
| 1.8 | Dane nieletnich: wiek zgody cyfrowej w Polsce to 16 lat; poniżej wymagana zgoda rodzica lub działanie przez szkołę | ⬜ | M | tak | przy modelu szkolnym zgodę zapewnia szkoła; przy korepetycjach potrzebny przepływ zgody |
| 1.9 | Informowanie ucznia o widoczności jego wyników dla nauczyciela | ✅ | — | — | jest na ekranie dołączania do klasy (CLAUDE.md, Classes) |
| 1.10 | Minimalizacja danych: do zapisu trafiają identyfikator Auth0, imię i e-mail z tokenu, wyniki | ✅ | — | — | brak śledzenia reklamowego i analityki zewnętrznej w kodzie |
| 1.11 | Prawa osoby, której dane dotyczą: wgląd, sprostowanie, **usunięcie konta i danych**, eksport | 🟡 | M | tak | **Usunięcie konta: nie istnieje** (brak trasy i zakresu Auth0, sekcja 9.3). Wgląd częściowy (`GET /api/attempts`, podsumowania); pełnego eksportu nie ma, CSV tylko dla nauczyciela (9.4 L1, L13) |
| 1.12 | Retencja: jak długo trzymamy podejścia, nieaktywne konta, zgłoszenia, logi audytu | ⬜ | S (decyzja) + M | tak | zasada + zadanie sprzątające (analogiczne do crona mediów) |
| 1.13 | Procedura naruszenia ochrony danych (72 h do UODO), kontakt, rejestr incydentów | ⬜ | S | tak | szablon + kto decyduje |
| 1.14 | Pliki cookie i pamięć przeglądarki: dziś `localStorage` na ustawienia (funkcjonalne) i sesja Auth0; brak analityki | ✅/🟡 | S | — | baner potrzebny dopiero po dodaniu analityki lub reklam; opisać w polityce |
| 1.15 | Prawa autorskie do treści: quizy tworzone na podstawie stron podręczników (zakresy stron w tytułach) | ⬜ | S–M | dla katalogu publicznego | własne pytania są bezpieczne; kopiowanie struktury lub treści podręcznika nie. Zasady dla nauczycieli, zgłaszanie naruszeń, wyłączenie z publicznego katalogu |
| 1.16 | Obrazy: licencje (CC0 / domena publiczna / własne), atrybucja przy CC BY, brak treści niedozwolonych w przesłanych plikach | 🟡 | S–M | — | pole na źródło i licencję przy obrazie, procedura zgłoszeń, moderacja |
| 1.17 | Dostępność (WCAG 2.1 AA; dla usług edukacyjnych dla instytucji publicznych obowiązują wymogi dostępności) | 🟡 | M | zależy od klienta | część komponentów ma `aria-*` i obsługę klawiatury; brak audytu; sprawdzić zakres obowiązku |
| 1.18 | Sprzedaż konsumentom: dane sprzedawcy, ceny z VAT, 14 dni na odstąpienie (treści cyfrowe), faktury, VAT OSS dla UE | ⬜ | M | przy płatnościach | większość załatwia pośrednik płatniczy (merchant of record) |

## 2. Infrastruktura, licencje i koszty (orientacyjnie, sprawdź cenniki)

| # | Pozycja | Stan | Wysiłek | Blokada | Uwagi |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Vercel: plan **Pro** (Hobby = tylko niekomercyjny) | ⬜ | S | tak | rząd 20 USD/miesiąc za użytkownika; cron częstszy niż raz dziennie wymaga Pro |
| 2.2 | Neon: plan płatny (limity transferu, magazyn, historia przywracania, dostępność) | ⬜ | S | zalecane | rząd kilkudziesięciu USD/miesiąc; bucket Object Storage w tym samym projekcie |
| 2.3 | Auth0: plan płatny przy większej liczbie użytkowników (limity darmowego, role/RBAC, własna domena, społeczne logowania) | ⬜ | S | zależnie od skali | rozważyć alternatywy (koszty rosną z liczbą aktywnych użytkowników) |
| 2.4 | Sentry: plan dla zespołu lub zostać przy darmowym | 🟡 | S | — | region i dane w zdarzeniach (identyfikator użytkownika = `sub`) opisać w polityce |
| 2.5 | Domena własna, certyfikat (Vercel automatycznie), poczta kontaktowa | ⬜ | S | — | adres kontaktowy wymagany w polityce i regulaminie |
| 2.6 | Kopie zapasowe i przywracanie: Neon ma przywracanie do punktu w czasie, okno zależy od planu; plan i test odtworzenia | 🟡 | S–M | tak | środowiska rozdzielone 2026-10-20 (gałęzie preview/dev/e2e); plan przywracania i test odtworzenia nadal do zrobienia |
| 2.7 | Bucket mediów: koszty miejsca i transferu, limity na autora (są), sprzątanie (jest) | ✅ | — | — | monitorować wzrost; klucze `dev/`, `preview/`, produkcja bez prefiksu |
| 2.8 | Monitoring dostępności i alerty (uptime, 5xx, koszty) | 🟡 | S | — | Sentry jest; brak sondy zewnętrznej i alertów budżetowych |
| 2.9 | Budżet miesięczny na pilotaż | ⬜ | S | — | rząd 100–200 USD/miesiąc przy planach płatnych (do zweryfikowania) |

## 3. Produkt potrzebny do sprzedaży

| # | Pozycja | Stan | Wysiłek | Uwagi |
| --- | --- | --- | --- | --- |
| 3.1 | Organizacje: szkoła/firma jako byt (administrator, nauczyciele, klasy), zaproszenia, zarządzanie licencjami | ⬜ | L | dziś klasa należy do nauczyciela; bez tego trudno sprzedać szkole |
| 3.2 | Plany i limity (kwoty klas, uczniów, quizów, obrazów, wywołań MCP) | ⬜ | M | część limitów mediów już istnieje |
| 3.3 | Płatności: pośrednik (Stripe / Przelewy24 / PayU / Paddle jako merchant of record), webhooki, anulowanie, faktury | ⬜ | L | merchant of record upraszcza VAT |
| 3.4 | Onboarding: pierwsze 5 minut nauczyciela (utwórz klasę → quiz z LLM → przydziel), dane demonstracyjne | 🟡 | M | kod dołączania do klasy jest; brak przewodnika i przykładowych treści |
| 3.5 | Wsparcie: adres, formularz (jest `feedback`), czas odpowiedzi, baza wiedzy | 🟡 | S | formularz uwag z diagnostyką już działa |
| 3.6 | Powiadomienia e-mail (zaproszenie, termin zadania, reset) | ⬜ | M | dziś aplikacja nie wysyła e-maili |
| 3.7 | Eksport i przenoszenie danych nauczyciela (quizy, wyniki) | 🟡 | S–M | CSV raportu klasy jest; eksport quizów przez MCP/skrypt |
| 3.8 | MCP jako kanał sprzedaży: dokumentacja dla klientów (`docs/mcp-clients.md`), tokeny, limity wywołań | 🟡 | M | rozważyć limity i metering wywołań narzędzi, ostrzeżenie o kosztach tokenów modelu po stronie klienta |
| 3.9 | Analityka produktowa zgodna z RODO (bez danych osobowych) | ⬜ | S–M | do pilotażu wystarczą zapytania do bazy |

## 4. Bezpieczeństwo i niezawodność

| # | Pozycja | Stan | Wysiłek | Uwagi |
| --- | --- | --- | --- | --- |
| 4.1 | Autoryzacja i izolacja: prywatne API, role, uprawnienia po stronie serwera, testy odmów | ✅ | — | `test:mcp` ma 366 przypadków, w tym odmowy |
| 4.2 | Audyt zmian administracyjnych i MCP | ✅ | — | `admin_audit_log` |
| 4.3 | **Limit prób dla kodów dołączania do klasy** | ⬜ | S | CLAUDE.md: „Join codes are not rate limited yet” — przy produkcie publicznym podatne na zgadywanie |
| 4.4 | Limity żądań i ochrona przed nadużyciami (REST, MCP, logowanie, wysyłanie obrazów) | 🟡 | M | media mają limity dzienne; brak ogólnego limitera |
| 4.5 | Ochrona przed SSRF przy pobieraniu obrazów z adresu | ✅ | — | bramka `MEDIA_URL_FETCH` wyłączona na produkcji do czasu testu wiązania IP na Vercelu |
| 4.6 | Przesyłane pliki: tylko PNG/JPEG/WebP po bajtach, limit 2 MB; brak skanowania treści | 🟡 | M | moderacja i zgłaszanie nadużyć przy otwarciu dla uczniów |
| 4.7 | Sekrety i klucze: Vercel (wrażliwe), rotacja, minimalne zakresy tokenów | 🟡 | S | rotacja kluczy S3 i Auth0 M2M nieprzećwiczona |
| 4.8 | Przegląd zależności (aktualizacje, luki) | ⬜ | S | włączyć automatyczne alerty zależności |
| 4.9 | Test penetracyjny lub choć przegląd OWASP (uwierzytelnianie, IDOR, wstrzyknięcia, CSRF/CORS) | ⬜ | M–L | najbardziej wartościowe przed szkołami |
| 4.10 | Plan reagowania na incydent i wycofania wdrożenia (`vercel rollback`, migracje wyłącznie wprzód) | 🟡 | S | rollback udokumentowany w planie 5.C; brak runbooka incydentu |
| 4.11 | Wydajność i skala: test obciążeniowy dla klasy 30 uczniów jednocześnie | ⬜ | S–M | funkcje serverless + pula połączeń Neon; sprawdzić limity połączeń |
| 4.12 | Rozdzielenie środowisk (dev/preview/e2e/prod), dane osobowe usunięte z kopii | ✅ | — | gałęzie Neon z osobnymi bucketami; `docs/vercel.md`, "Środowiska i bazy danych" |

## 5. Dojrzałość techniczna (to, co już jest)

✅ Spójny rdzeń domeny i ocena po stronie serwera, testy jednostkowe i e2e (gate lokalna `npm run gate`), kanarek architektury, migracje wprzód, dokumentacja w vaultcie, deploy i rollback, Sentry, wersja mobilna (zweryfikowana na telefonie w przeglądarce headless), obrazy z bezpieczeństwem (SSRF, typ po bajtach, limity), narzędzia MCP z audytem. 🟡 Brak testów obciążeniowych, audytu dostępności, przeglądu bezpieczeństwa przez osobę trzecią.

## 6. Rynek, walidacja i model

**Wyróżnik:** tworzenie i analiza quizów przez własnego asystenta (Claude / ChatGPT) przez standard MCP — „quiz w 2 minuty” bez wbudowanego generatora.
**Słabość:** rynek szkolny w Polsce jest nasycony darmowymi narzędziami; nauczyciele rzadko płacą z własnej kieszeni.

| # | Hipoteza | Jak sprawdzić (tanio) | Kryterium |
| --- | --- | --- | --- |
| 6.1 | Korepetytorzy i małe szkoły językowe zapłacą za narzędzie do czasowników, powtórek i raportów | 5–10 rozmów z pokazem „quiz z Claude”, pytanie o cenę | ≥ 3 osoby deklarują zapłatę |
| 6.2 | Nauczyciel utworzy więcej niż jeden quiz sam | pilotaż: 1–2 klasy, 4 tygodnie | ≥ 3 quizy na nauczyciela |
| 6.3 | Uczniowie wracają | miary z bazy: aktywne dni, seria, powtórki | ≥ 40% wraca w drugim tygodniu |
| 6.4 | MCP jest realnym kanałem | ilu nauczycieli ma konto Claude/ChatGPT z konektorami | uczciwa odpowiedź z rozmów |

Modele przychodu do rozważenia: **freemium dla nauczycieli** (limit klas/uczniów, płatne raporty i obrazy), **abonament dla korepetytorów/szkół językowych**, **licencja szkolna roczna**. Cena do ustalenia dopiero po 6.1.

## 7. Plan 30 / 60 / 90 dni

| Okres | Cel | Zadania |
| --- | --- | --- |
| 0–30 dni | bezpieczny pilotaż (bez pieniędzy) | decyzja o roli prawnej (1.1), polityka i regulamin (1.3–1.4), rejestr (1.2), limit kodów klas (4.3), usunięcie konta (1.11), plan przywracania (2.6), przeniesienie danych do UE lub podstawa transferu (1.7), 5–10 rozmów (6.1) |
| 31–60 dni | pilotaż z 1–2 klasami | onboarding (3.4), e-mail (3.6), limitery (4.4), przegląd OWASP (4.9), miary (6.2–6.3), plan Vercel Pro i Neon (2.1–2.2) |
| 61–90 dni | decyzja o płatnościach | wyniki pilotażu, model cenowy, płatności i plany (3.2–3.3), organizacje (3.1) tylko jeśli klient szkolny jest potwierdzony |

## 8. Decyzje do podjęcia (przez właściciela)

1. **Model sprzedaży**: korepetytorzy / szkoły językowe (szybciej) czy szkoły (wolniej, więcej formalności)?
2. **Jurysdykcja danych**: czy migrujemy bazę i Auth0 do UE przed pilotażem?
3. **Dostawca płatności**: merchant of record (prostsze podatki) czy własne rozliczenia?
4. **Publiczny katalog quizów**: tak (wymaga moderacji i praw autorskich) czy prywatne biblioteki nauczycieli?
5. **MCP**: czy to funkcja płatna (Pro), czy darmowa dla każdego nauczyciela?
6. **Ile czasu i pieniędzy** jesteś gotów przeznaczyć na walidację, zanim zainwestujemy w organizacje i płatności.

## 9. Inwentarz danych osobowych

> Stan z kodu i migracji repozytorium na 2026-10-20 (gałąź `vercel-neon`). Nie zawiera decyzji o retencji ani o rolach prawnych: to jest w sekcjach 1 i 9.5. Kolumna „Kto czyta” opisuje to, co pokazuje kod (routy, repozytoria, narzędzia MCP), nie to, co wynika z umów.

### 9.1 Gdzie są dane osobowe

Kategorie: **identyfikator** (wiąże wiersz z osobą), **dane kontaktowe**, **wyniki nauki**, **diagnostyka**, **treść wolna** (tekst wpisany przez człowieka), **logi**.

| Tabela.kolumna | Kategoria | Cel | Kto czyta (kod) | Źródło wartości | Migracja / zapis |
| --- | --- | --- | --- | --- | --- |
| `user_profiles.user_id` | identyfikator | łączy profil, aktywność i wyniki z kontem Auth0 (`sub`) | właściciel; nauczyciel członków swoich klas (`server/classes/classes.ts`); admin (`server/classes/results.ts`) | system (`sub` z tokenu) | `20261018100000_user_profiles_and_activity.sql`; zapis `server/progressRepo.ts` |
| `user_profiles.display_name`, `email` | dane kontaktowe | rozpoznanie ucznia przez nauczyciela | nauczyciel: pełny e-mail w liście członków (`classes.ts`), zamaskowany w wyszukiwaniu kandydatów (`routes/classes.ts`, `maskEmail`); admin: pełny e-mail w `GET /api/admin/students` (`results.ts`); MCP `student_search`: zamaskowany | token: claimy `https://quiz.local/name` i `/email` (`server/auth.ts`), zapis `syncIdentity` przy `GET /api/progress/summary` i `POST /api/classes/join` | `20261018130000_classes.sql` (kolumny); zapis `server/progressRepo.ts` |
| `user_profiles.timezone` | identyfikator pośredni (strefa IANA) | liczenie dni i serii w strefie użytkownika | właściciel (`PATCH /api/progress/profile`) | klient (`useTimezoneSync`), domyślnie `UTC` | `20261018100000_user_profiles_and_activity.sql` |
| `user_profiles.daily_goal`, `created_at`, `updated_at` | wyniki nauki (cel) | cel dnia | właściciel | klient (`PATCH`), system (czasy) | `20261018100000_…` |
| `quiz_attempts.user_id` | identyfikator | przypisanie podejścia do osoby | właściciel (`GET /api/attempts`, `server/quizRepo.ts`); nauczyciel tylko podejścia do zadań swojej klasy (`server/classes/results.ts`, `studentResults`); admin wszystkie (`GET /api/admin/students/:userId/results`, `server/userResults.ts`); MCP `attempt_*` tylko admin, OAuth | system (`sub`) przy `POST /api/quizzes/:id/grade` | `20261017150100_quiz_attempts.sql` |
| `quiz_attempts.answers`, `results`, `questions_snapshot` | treść wolna / wyniki nauki | odpowiedzi ucznia (także tekst wpisany w pytaniu otwartym), ocena, przegląd błędów | jak wyżej; w widoku nauczyciela i admina z odpowiedziami (`StudentResults`, `AdminStudentResultsView`) | klient (odpowiedzi), system (ocena) | `…150100_quiz_attempts.sql`; `20261020100000_attempt_questions_snapshot.sql` |
| `quiz_attempts.quiz_title`, `score`, `max_score`, `percent`, `passed`, `course_id`, `created_at` | wyniki nauki | statystyki, raporty, seria | jak wyżej | system | `…150100`, `20261017160200_learning_courses.sql` |
| `lesson_progress.user_id`, `lesson_id`, `completed_at` | wyniki nauki | postęp lekcji i status zadania kursu | właściciel; nauczyciel (pochodny status w raporcie) | system | `20261017160200_learning_courses.sql` |
| `daily_activity.user_id`, `day`, `answered`, `correct`, `lessons_completed` | wyniki nauki | seria, cel dnia; `last_day` w wyszukiwarce uczniów | właściciel; admin (`searchUsers` w `server/classes/results.ts`) | system (`progress.recordActivity`) | `20261018100000_…` |
| `verb_reviews.user_id`, `verb_id`, `box`, `due_at`, `attempts`, `correct`, `lapses`, `last_reviewed_at`, `last_wrong_at` | wyniki nauki | powtórki Leitnera, „słabe” czasowniki | właściciel; admin w widoku wyników ucznia (`server/userResults.ts`) | system (hook po ocenie) | `20261018110000_spaced_repetition.sql`, `20261018120000_verb_reviews_last_wrong.sql` |
| `class_members.user_id`, `joined_at` | identyfikator + przynależność do klasy | członkostwo | nauczyciel właściciela klasy; uczeń (`GET /api/my/classes`); admin (podgląd `scope=all`) | uczeń (kod dołączenia, `POST /api/classes/join`), system | `20261018130000_classes.sql` |
| `classes.owner_id`, `assignments.created_by` | identyfikator (nauczyciel) | właściciel klasy i autor zadania | właściciel; admin (`scope=all`); MCP `class_*` (zmiana tylko przez właściciela) | system (`sub`); zmiana właściciela przez admina/MCP `class_transfer` (`server/classes/classes.ts`) | `20261018130000_classes.sql` |
| `api_tokens.user_id`, `name`, `token_hash`, `prefix`, `permissions`, `created_at`, `expires_at`, `last_used_at`, `revoked_at` | identyfikator + diagnostyka (kiedy używany) | personalne tokeny MCP | właściciel (`GET /api/tokens`); brak endpointu odczytu dla admina | klient (nazwa tokenu), system | `20261017180000_api_tokens.sql`; `server/apiTokens.ts` |
| `feedback.user_id`, `user_label`, `message`, `context` | identyfikator, dane kontaktowe (`user_label`), treść wolna, diagnostyka (`route`, `userAgent`, `viewport`, `theme`, `appVersion`, `sentryEventId`, ostatni nieudany request) | obsługa zgłoszeń | admin (`GET /api/admin/feedback`); autor nie ma odczytu | klient (`src/features/feedback/FeedbackModal.tsx`: `user_label` = e-mail lub imię z klienta, bez weryfikacji po stronie serwera) | `20261017190000_feedback_and_audit.sql`; zapis `server/adminRepo.ts` |
| `admin_audit_log.actor_id`, `actor_label`, `target_id`, `target_label`, `details` | identyfikator, dane kontaktowe (etykiety = e-mail lub imię z Auth0), logi | ślad zmian administracyjnych i MCP | admin (`GET /api/admin/audit`) | system; etykiety z `server/auth0Management.ts` (`userLabel`) | `20261017190000_…`; zapis `server/adminRepo.ts` |
| `app_settings.updated_by` | identyfikator administratora | kto zmienił progi wyników | admin | system | `20261018160000_app_settings.sql` |
| `media.owner_id`, `sha256`, `source`, `created_at`, `key` | identyfikator (autor pliku) | własność pliku, deduplikacja | odczyt przez API nieweryfikowany w tej analizie (sprawdzić `server/media`) | system (`sub`) | `20261020110000_media.sql`; `public_read` w bucketcie (`docs/Media-Storage-Plan.md`) |
| `quizzes.owner_id` | identyfikator (autor quizu) | autorstwo | zapisywany przy tworzeniu (`server/quizRepo.ts`); w odpowiedziach API nie znaleziono zwrotu tego pola (sprawdzone `grep ownerId`) | system (`sub`) | `20261017170000_quiz_owner.sql` |
| `quizzes`, `questions`, `options` (treść) | treść wolna | treść quizów pisana przez nauczyciela | publicznie w `GET /api/quizzes` (bez odpowiedzi) | klient (edytor) | `20261017140000_create_quizzes.sql` i kolejne |

Bez danych osobowych: `irregular_verbs` i tabele słownikowe, `courses`, `lessons`, `lesson_verbs`, `subjects`, `planets` (nieużywana pozostałość szablonu). Obrazy wpięte w pytania to osobna sprawa (zob. 9.2 i 9.4).

### 9.2 Dane poza bazą

| Miejsce | Co przechowuje lub wysyła | Ślad w repozytorium | Czego nie da się zweryfikować w repozytorium |
| --- | --- | --- | --- |
| **Auth0** (tenant `dev-4xxb1z18b3z4hc6s.us.auth0.com`, `docs/Auth.md`) | konto: `sub`, e-mail, imię; logowania i logi tenanta; role (`https://quiz.local/roles`) i blokady; dane czytane przez Management API (`server/auth0Management.ts`: odczyt, role, blokada) | `server/auth.ts`, `docs/Auth.md`, Action „Quiz: roles claim” | okres przechowywania logów Auth0, lokalizacja danych tenanta (domena wskazuje USA) |
| **Sentry** (opcjonalny: `VITE_SENTRY_DSN`, `SENTRY_DSN`) | przeglądarka (`src/app/sentry.ts`): `release`, `environment`, użytkownik = `sub` (`src/features/auth/AuthProvider.tsx`), tag `api_status`, `request_id`, kontekst endpointu i statusu (`src/app/errorTracking.ts`); `beforeSend` obcina query z URL. Serwer (`server/sentry.ts`): tag `request_id`, użytkownik = `sub`, kontekst metody i ścieżki | kod powyżej | czy wysyłane są adresy IP (w kodzie nie ustawiono `sendDefaultPii`, więc obowiązuje domyślne zachowanie SDK), czy ścieżka serwera zawiera query, czy breadcrumbs (konsola, fetch, kliknięcia) są cenzurowane, region projektu |
| **Vercel** (`vercel.json`, `docs/vercel.md`) | logi funkcji (JSON z `requestId`, zdarzenia cleanupu mediów), zmienne środowiskowe; cron `GET /api/media/cleanup` o 03:00 | `vercel.json` (brak klucza `regions`) | region funkcji (brak w repozytorium, działa domyślny region Vercel), czy identyfikatory użytkowników trafiają do logów, okres przechowywania logów |
| **Neon** (projekt `quiz-neon`, `aws-us-east-1`, `docs/Media-Storage-Plan.md`) | cała baza z 9.1; kopie i przywracanie zależne od planu (`docs/Commercial-Readiness` 2.6) | `db/migrations/`, `server/db.ts` | okres przywracania przy aktualnym planie |
| **Neon Object Storage**, bucket `media` (`public_read`, `docs/Media-Storage-Plan.md`) | obrazy przesłane przez autorów (PNG/JPEG/WebP, do 2 MB, klucze losowe). Obrazy mogą zawierać osoby: nie są celowo danymi osobowymi, ale zdjęcie człowieka jest daną osobową. Adres obiektu jest publiczny | `server/media/` | czy aplikacja usuwa metadane EXIF (w `server/media` nie znaleziono kodu do EXIF) |
| **Przeglądarka: localStorage** | `quiz:settings` (motyw, kompakt, głos, cel; bez danych osobowych; `src/app/persist.ts`); klucze cache Auth0 SDK (`cacheLocation="localstorage"`, `useRefreshTokens` w `AuthProvider.tsx`): tokeny dostępu i odświeżania | `src/app/persist.ts`, `src/features/auth/AuthProvider.tsx` | nazwy kluczy wewnętrznych Auth0 SDK (zależność, nie kod repozytorium) |
| **Przeglądarka: sessionStorage** | wybory generatora quizu, osobno dla każdego quizu (`src/features/quizzes/lastGenerate.ts`) | `src/features/quizzes/lastGenerate.ts` | — |
| **Cookies i IndexedDB** | aplikacja nie ustawia cookies (brak `document.cookie` w `src/`) ani nie używa IndexedDB | grep w `src/` i `server/` | cookies ustawiane przez Auth0 SDK, jeśli SDK je tworzy (zależność, nie sprawdzono) |

### 9.3 Cykl życia danych

Stan dziś, bez zmian w kodzie. „Nie” oznacza brak trasy, przycisku ani zadania w repozytorium.

| Klasa danych | Jak powstaje | Jak długo trzymamy dziś | Użytkownik może usunąć | Admin może usunąć | Eksport |
| --- | --- | --- | --- | --- | --- |
| Profil (`user_profiles`) i konto Auth0 | przy pierwszym zapisie postępu lub dołączeniu do klasy (`syncIdentity`) | bezterminowo; brak zadania czyszczącego | nie | nie (admin ma tylko zmianę ról i blokadę, `server/routes/admin.ts`; zakresy Auth0 nie obejmują `delete:users`) | nie |
| Podejścia (`quiz_attempts`) | `POST /api/quizzes/:id/grade` | bezterminowo | nie (brak `DELETE`) | nie | `GET /api/attempts` (tylko własne, domyślnie 50 ostatnich); CSV raportu klasy (nauczyciel); `attempt_list`/`attempt_get` (MCP, admin) |
| Usunięcie quizu | `DELETE /api/quizzes/:id` (`write:quizzes`) kasuje quiz, pytania i powiązania mediów (`server/quizRepo.ts`) | podejścia **zostają**: `quiz_id` ustawiane na NULL (`ON DELETE SET NULL`), `quiz_title`, `user_id`, odpowiedzi i `questions_snapshot` pozostają | — (autor/admin quizu) | tak, z uprawnieniem `write:quizzes` | — |
| Postęp lekcji, dzienna aktywność, powtórki (`lesson_progress`, `daily_activity`, `verb_reviews`) | hooki po ocenie i ukończeniu lekcji | bezterminowo | nie | nie | podsumowania przez `GET /api/progress/summary`, `GET /api/reviews/summary` |
| Członkostwo w klasie (`class_members`) | `POST /api/classes/join` | do usunięcia członkostwa lub zarchiwizowania klasy | tak: `DELETE /api/my/classes/:id` (opuszczenie klasy, `server/classes/classes.ts`) | nie (podgląd `scope=all` jest tylko do odczytu) | nie |
| Klasa i zadania (`classes`, `assignments`) | nauczyciel (`POST /api/classes`) | klasa: miękkie archiwum (`archived_at`), nic nie jest kasowane; zadanie: twarde `DELETE` | nauczyciel: archiwizacja klasy, usunięcie zadania, usunięcie członka (`DELETE /api/classes/:id/members/:userId`) | przez MCP `class_archive`, `assignment_delete` (zakres uprawnień w `server/classAccess.ts`) | CSV raportu klasy, `class_report` (MCP) |
| Tokeny API (`api_tokens`) | `POST /api/tokens` (limit 20 aktywnych) | wiersz trwa; token po `revoked_at` albo `expires_at` przestaje działać, wiersz nie jest kasowany | tak: `DELETE /api/tokens/:id` (ustawia `revoked_at`) | nie | `GET /api/tokens` (nazwy i daty, bez tokenu) |
| Zgłoszenia (`feedback`) | `POST /api/feedback` | bezterminowo | nie | nie (admin zmienia tylko status, `PATCH /api/admin/feedback/:id`) | `GET /api/admin/feedback` |
| Audyt (`admin_audit_log`) | każda zmiana admina i wywołanie MCP (`mcp.call`) | bezterminowo | nie | nie | `GET /api/admin/audit` |
| Odczyty przez admina (wyniki ucznia) | `GET /api/admin/students/:userId/results` | odczyt nie jest zapisywany w audycie | — | — | — |
| Obrazy (`media`, bucket) | upload: wiersz `pending`, po weryfikacji `ready` | cron: `pending` starsze niż 1 h i `ready` bez odwołań starsze niż 24 h (`server/media/constants.ts`, `vercel.json`); plik z odwołaniami zostaje | przez usunięcie z quizu (wiersz `media_refs`) | tak, tym samym sposobem | brak (URL publiczny) |
| Logi i diagnostyka w Sentry i Vercel | zdarzenia błędów | zależne od dostawców, poza repozytorium | nie | nie | panel dostawcy |

**Usunięcie konta: nie istnieje.** Nie ma trasy, przycisku w UI, ani narzędzia MCP, które kasowałyby profil, podejścia, postęp, tokeny, zgłoszenia lub konto Auth0. Dowód: w `server/routes/` nie ma `DELETE` na użytkowniku, admin ma tylko zmianę ról i blokadę (`server/routes/admin.ts`), a `server/auth0Management.ts` nie ma zakresu `delete:users` (CLAUDE.md, lista zakresów).

**Eksport: częściowy.** Użytkownik widzi własne podejścia (do 50 ostatnich), podsumowania postępu i powtórek. Nie ma pliku z pełnymi danymi konta. Nauczyciel dostaje CSV raportu klasy.

**Podejścia po usunięciu quizu:** zostają z `quiz_title` i `user_id`, a `quiz_id` jest pusty (migracja `20261017150100_quiz_attempts.sql`).

### 9.4 Luki wobec RODO

Każda luka ma dowód w kodzie. Numer w nawiasie to wiersz sekcji 1–4, którego dotyczy.

| # | Luka | Dowód | Wiersz |
| --- | --- | --- | --- |
| L1 | Brak usunięcia konta i danych użytkownika; admin nie może usunąć konta, a Auth0 nie ma zakresu kasowania | `server/routes/admin.ts`, `server/auth0Management.ts` | 1.11 |
| L2 | Brak retencji i zadania czyszczącego dla `quiz_attempts`, `daily_activity`, `verb_reviews`, `user_profiles`, `feedback`, `admin_audit_log`, `api_tokens`; jedyny cron to media | `vercel.json` (`crons`: tylko `/api/media/cleanup`) | 1.12 |
| L3 | Zgłoszenia zawierają diagnostykę (`userAgent`, `viewport`, `route`) i `user_label` z klienta, bez limitu czasu | `src/features/feedback/FeedbackModal.tsx`, `server/adminRepo.ts` | 1.2, 1.12 |
| L4 | Audyt przechowuje e-mail administratora i osoby, której dotyczy zmiana (etykiety z Auth0), bez retencji | `server/auth0Management.ts` (`userLabel`), `server/adminRepo.ts` | 1.12, 4.2 |
| L5 | Admin czyta pełne odpowiedzi wszystkich uczniów (do 200 podejść), a odczyt nie jest zapisywany w audycie; brak informacji dla ucznia o takim dostępie | `server/routes/admin.ts` (`/admin/students/:userId/results`), `server/userResults.ts` | 1.1, 1.3, 4.2 |
| L6 | Pełny e-mail ucznia widoczny nauczycielowi w liście członków i adminowi w wyszukiwarce; maskowanie tylko w wyszukiwaniu kandydatów | `server/classes/classes.ts`, `server/classes/results.ts`, `server/routes/classes.ts` (`maskEmail`) | 1.8, 1.9 |
| L7 | E-mail i imię ucznia kopiowane z tokenu przy każdym `GET /api/progress/summary` i dołączeniu, bez możliwości usunięcia przez ucznia (zob. L1) | `server/progressRepo.ts` (`syncIdentity`), `server/auth.ts` | 1.10 |
| L8 | Kod dołączenia do klasy nie ma limitu prób | `server/routes/classes.ts` (`POST /classes/join`); CLAUDE.md: „Join codes are not rate limited yet” | 4.3 |
| L9 | Sentry dostaje `sub` przy każdym błędzie serwera i przeglądarki; serwer nie ma `beforeSend`, a przeglądarka tylko obcina query z URL; brak wpisu w umowie powierzenia | `server/sentry.ts`, `src/app/sentry.ts`, `src/features/auth/AuthProvider.tsx` | 1.6, 2.4 |
| L10 | Dane w USA: baza Neon `aws-us-east-1`, tenant Auth0 `…us.auth0.com`, bucket w tym samym projekcie | `docs/Media-Storage-Plan.md`, `docs/Auth.md` | 1.7 |
| L11 | Obrazy w bucketcie są publiczne (`public_read`); nie znaleziono kodu usuwającego metadane EXIF; zdjęcia osób nie mają opisanej zgody ani licencji w danych | `docs/Media-Storage-Plan.md`, `server/media/` | 1.16, 4.6 |
| L12 | Tokeny Auth0 (dostępu i odświeżania) są w localStorage; trzeba to opisać w polityce | `src/features/auth/AuthProvider.tsx` (`cacheLocation="localstorage"`, `useRefreshTokens`) | 1.14, 4.7 |
| L13 | Brak eksportu pełnych danych użytkownika; `GET /api/attempts` zwraca 50 ostatnich podejść | `server/quizRepo.ts` (`listAttempts`, limit 50) | 1.11, 3.7 |

### 9.5 Pytania do właściciela

1. Jaki region ma funkcja Vercel? `vercel.json` nie ustawia `regions`, więc działa domyślny region; jeśli ma być w UE, trzeba ustawić go w projekcie.
2. Jaki jest region projektu Sentry (UE czy USA) i czy w panelu włączono „Send Default PII” oraz cenzurowanie danych (IP, breadcrumbs)?
3. Jaka jest retencja: po ilu latach usuwać podejścia, aktywność dzienną, zgłoszenia i audyt, i po ilu miesiącach bez logowania uznać konto za nieaktywne (decyzja biznesowa, wiersz 1.12)?
4. Co ma się dziać przy usunięciu konta: kasować wszystko, czy anonimizować podejścia (zostawiając statystyki klasy)? Wiersz 1.11 zależy od tej decyzji.
5. Czy nauczyciel ma widzieć pełny e-mail ucznia, czy wystarczy imię (minimalizacja danych, L6)?
6. Czy zdjęcia w bucketcie mogą pokazywać osoby i czy wymagamy licencji i zgody przy przesyłaniu (L11)? Do konsultacji z prawnikiem.

## Powiązane

- [[Roadmap]] — stan techniczny i kolejność prac
- [[Phase5C-Orchestration]] — bieżący cykl prac nad granicami modułów
- [[mcp-clients]] — rejestracja klientów MCP (kanał sprzedaży)
- [[vercel]] — wdrożenie, zmienne środowiskowe, rollback
