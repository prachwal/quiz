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
| 1.2 | Rejestr czynności przetwarzania / inwentarz danych (jakie dane, po co, gdzie, kto widzi, jak długo) | 🟡 | S | tak | sekcja 9 poniżej (wypełnia analiza kodu); wymaga uzupełnienia o decyzje biznesowe (retencja) |
| 1.3 | Polityka prywatności (po polsku, zrozumiała dla ucznia/rodzica) | ⬜ | S–M | tak | link w stopce i na ekranie logowania |
| 1.4 | Regulamin usługi | ⬜ | S–M | tak | zakres, odpowiedzialność, treści tworzone przez nauczycieli |
| 1.5 | Umowa powierzenia przetwarzania danych (DPA) dla szkół | ⬜ | M | tak (dla szkół) | wzór + zasady dla podwykonawców |
| 1.6 | Umowy powierzenia z dostawcami (Auth0, Vercel, Neon, Sentry) i lista podwykonawców | ⬜ | S | tak | zwykle akceptowane w panelach dostawców; wpisać do rejestru |
| 1.7 | **Transfer danych poza EOG**: Neon `us-east-1`, Auth0 tenant w USA, Sentry (region zależy od projektu), Vercel (region funkcji: sprawdzić) | 🟡 | M–L | zalecane przed produkcją | EU-region dla bazy i Auth0 lub podstawa prawna (SCC / certyfikacja DPF); migracja bazy to osobny projekt |
| 1.8 | Dane nieletnich: wiek zgody cyfrowej w Polsce to 16 lat; poniżej wymagana zgoda rodzica lub działanie przez szkołę | ⬜ | M | tak | przy modelu szkolnym zgodę zapewnia szkoła; przy korepetycjach potrzebny przepływ zgody |
| 1.9 | Informowanie ucznia o widoczności jego wyników dla nauczyciela | ✅ | — | — | jest na ekranie dołączania do klasy (CLAUDE.md, Classes) |
| 1.10 | Minimalizacja danych: do zapisu trafiają identyfikator Auth0, imię i e-mail z tokenu, wyniki | ✅ | — | — | brak śledzenia reklamowego i analityki zewnętrznej w kodzie |
| 1.11 | Prawa osoby, której dane dotyczą: wgląd, sprostowanie, **usunięcie konta i danych**, eksport | 🟡 | M | tak | sprawdzić w inwentarzu, czy istnieje przepływ usunięcia (profil, podejścia, postęp, tokeny, klasy); eksport CSV jest tylko dla nauczyciela |
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
| 2.6 | Kopie zapasowe i przywracanie: Neon ma przywracanie do punktu w czasie, okno zależy od planu; plan i test odtworzenia | 🟡 | S–M | tak | spisać RPO/RTO, przećwiczyć odtworzenie na gałęzi Neon |
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

_Sekcja wypełniana analizą kodu i migracji (kto, co, gdzie, ile czasu, jak usunąć)._

## Powiązane

- [[Roadmap]] — stan techniczny i kolejność prac
- [[Phase5C-Orchestration]] — bieżący cykl prac nad granicami modułów
- [[mcp-clients]] — rejestracja klientów MCP (kanał sprzedaży)
- [[vercel]] — wdrożenie, zmienne środowiskowe, rollback
