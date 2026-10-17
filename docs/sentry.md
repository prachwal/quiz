# Sentry – śledzenie błędów

Stan na 2026-10-17. Kod integracji jest wdrożony na produkcji (`dab9fcc`), ale **Sentry nie jest jeszcze
włączony**: brakuje adresu DSN. Bez DSN nic nie jest wysyłane (błędy serwera nadal trafiają do logów Netlify).

## Do zrobienia (po stronie właściciela konta)

1. Zaloguj się na https://sentry.io i utwórz organizację (plan Developer jest bezpłatny).
2. Utwórz projekt **React** (np. `quiz-web`) i skopiuj jego **DSN**, np.
   `https://abc123@o123456.ingest.sentry.io/789`.
3. Opcjonalnie utwórz projekt **Node.js** (np. `quiz-api`) dla błędów serwera. Można użyć tego samego DSN.
4. Ustaw zmienne (DSN jest publiczny z założenia – trafia do kodu przeglądarki):

   | Zmienna           | Gdzie działa                       | Przykład                                   |
   | ----------------- | ---------------------------------- | ------------------------------------------ |
   | `VITE_SENTRY_DSN` | frontend (wbudowana w paczkę przy buildzie) | DSN projektu React            |
   | `SENTRY_DSN`      | funkcja `api` (Express)            | DSN projektu Node (lub ten sam)            |

   ```bash
   netlify env:set VITE_SENTRY_DSN "https://…@….ingest.sentry.io/…" --force
   netlify env:set SENTRY_DSN "https://…@….ingest.sentry.io/…" --force
   ```

   Lokalnie dopisz je także do `.env` (plik jest w `.gitignore`).
5. Wdróż ponownie (`git push` na `main` uruchamia build na Netlify). Zmienne `VITE_*` są wbudowywane
   w czasie builda, więc sama zmiana zmiennej bez nowego wdrożenia nic nie da.

Zmienne `SENTRY_DSN` i `VITE_SENTRY_DSN` są już dodane do `SECRETS_SCAN_OMIT_KEYS` na Netlify, więc skaner
sekretów nie zablokuje builda (DSN znajdzie się w paczce JS).

## Co jest zintegrowane

### Frontend (`@sentry/react`)

| Element | Plik |
| ------- | ---- |
| Inicjalizacja (release = skrót commita, środowisko = tryb Vite, `tracesSampleRate: 0`) | `src/app/sentry.ts` |
| Ekran „Coś poszło nie tak” z kodem błędu, odświeżeniem i zgłoszeniem problemu | `src/main.tsx` (`Sentry.ErrorBoundary`), `src/features/feedback/ErrorFallback.tsx` |
| Zgłaszanie błędów 5xx i sieciowych z zapytań do API (4xx pomijane) | `src/app/errorTracking.ts` |
| Użytkownik w zdarzeniach = tylko `sub` z Auth0 (bez e-maila i nazwy) | `src/features/auth/AuthProvider.tsx` |
| Powiązanie uwagi użytkownika ze zdarzeniem (`captureFeedback`) | `src/features/feedback/FeedbackModal.tsx` |

Dodatkowo: `beforeSend` obcina adresy URL do ścieżki (bez parametrów), a znane szumy przeglądarki
(`ResizeObserver…`) są ignorowane.

Wersja aplikacji (`__APP_VERSION__`) pochodzi z `COMMIT_REF` ustawianego przez Netlify przy buildzie
(`vite.config.ts`), lokalnie jest to `dev`.

### Serwer (`@sentry/node`)

| Element | Plik |
| ------- | ---- |
| Inicjalizacja przy starcie aplikacji, `flush` przed zakończeniem funkcji | `server/sentry.ts` |
| Obsługa nieoczekiwanych błędów: log JSON + zdarzenie Sentry z tagiem `request_id` | `server/app.ts` (error handler) |
| Identyfikator zapytania: nagłówek `X-Request-Id` (z `x-nf-request-id`) | `server/app.ts` |

Odpowiedź przy błędzie 500 zawiera `requestId` i `eventId`, które trafiają też do zgłoszeń użytkowników
(tabela `feedback`, pole `context`), więc zgłoszenie można połączyć z błędem w Sentry.

## Czego NIE ma (świadomie lub jeszcze)

- **Source mapy.** Stosy z produkcji będą zminifikowane. Aby je odczytywać, dodaj wtyczkę Sentry do Vite
  (`@sentry/vite-plugin`) i token `SENTRY_AUTH_TOKEN` (sekret!) w Netlify. Nie jest to zrobione.
- **Monitoring wydajności / tracing** (`tracesSampleRate: 0`) i **Session Replay**.
- **Alerty** (e-mail, Slack). Skonfiguruj reguły w Sentry: Alerts → Create Alert.
- **Osobne środowiska.** Środowisko to `production` (build) lub `development`; podglądy wdrożeń (deploy
  preview) nie mają własnej nazwy.

## Weryfikacja po włączeniu

1. Po wdrożeniu otwórz stronę zalogowany i w konsoli przeglądarki wykonaj
   `setTimeout(() => { throw new Error('test sentry') })` – zdarzenie powinno pojawić się w projekcie
   React w ciągu kilkunastu sekund.
2. Zgłoś uwagę z menu użytkownika („Zgłoś uwagę”) – w Sentry pojawi się wpis User Feedback, a w panelu
   admina (Ustawienia → Uwagi) zgłoszenie z polem `sentry`.
3. Błąd serwera: wywołaj endpoint, który kończy się wyjątkiem (np. po chwilowej niedostępności bazy) –
   sprawdź zdarzenie z tagiem `request_id`. Logi funkcji: panel Netlify → Logs → Functions.

## Prywatność

- Wysyłamy: komunikat i stos błędu, wersję aplikacji, ścieżkę strony, przeglądarkę, id użytkownika Auth0.
- Nie wysyłamy: tokenów (JWT i osobistych `qz_…`), nagłówków autoryzacji, parametrów adresu, treści
  odpowiedzi API, adresu e-mail ani nazwy użytkownika.
- Pole `Authorization` nie jest dołączane do zdarzeń, ale unikaj wpisywania sekretów w komunikatach wyjątków.

## Rozwiązywanie problemów

| Objaw | Przyczyna / rozwiązanie |
| ----- | ----------------------- |
| Brak zdarzeń z przeglądarki | `VITE_SENTRY_DSN` nie było ustawione **w czasie builda** – wdróż ponownie. Sprawdź kartę Network (żądania do `*.ingest.sentry.io`) i blokery reklam (potrafią blokować Sentry). |
| Brak zdarzeń z serwera | `SENTRY_DSN` nie jest ustawione w Netlify albo funkcja nie została wdrożona od czasu zmiany zmiennej. |
| Build odrzucony przez skaner sekretów | Upewnij się, że `SENTRY_DSN,VITE_SENTRY_DSN` są w `SECRETS_SCAN_OMIT_KEYS` (są). |
| Stosy nieczytelne | Brak source map – patrz „Czego NIE ma”. |
