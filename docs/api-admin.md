# API – zadania administracyjne

Praktyczny przewodnik: jak z linii poleceń (curl / skrypty) zarządzać quizami, tokenami, uwagami i użytkownikami.
Pełny opis architektury jest w `CLAUDE.md`; tu są tylko rzeczy potrzebne do pracy.

- **Produkcja:** `https://fabulous-dieffenbachia.netlify.app/api` (lokalnie: `http://localhost:8888/api` z `npx netlify dev`)
- Całe API jest prywatne – poza `GET /api/health` każde żądanie wymaga nagłówka `Authorization: Bearer <credential>`.
- Błędy: `{ "error": "..." }`, walidacja (400): `{ "error": "Validation failed", "issues": [{ "path", "message" }] }`.
  Każda odpowiedź ma nagłówek `X-Request-Id` (przydatny przy szukaniu w Sentry/logach).
- Mutacje bez danych zwracają `{ "ok": true }` (nigdy 204/304).

## 1. Uwierzytelnianie – co czym można zrobić

| Credential | Skąd | Uprawnienia |
| ---------- | ---- | ----------- |
| **Osobisty token** `qz_…` | Ustawienia → Tokeny API (lub `POST /api/tokens`) | Tylko to, co zaznaczono przy tworzeniu: zwykły token = czytanie/granie; token z zapisem = `write:quizzes` (tylko gdy tworzy go admin) |
| **JWT Auth0** | logowanie w aplikacji | Zależnie od roli: `student`, `teacher` (`manage:classes`), `admin` (`write:quizzes`, `manage:users`) |

Ważne ograniczenia:

- Endpointy `/api/admin/*` wymagają `manage:users` – **nie da się ich wywołać osobistym tokenem** (token nigdy go nie dostaje). Do administracji użytkownikami potrzebny jest JWT admina (sekcja 6).
- `/api/tokens` działa tylko z JWT (sesja w przeglądarce), nie z tokenem.
- Token jest pokazywany raz; w bazie jest tylko jego hash SHA‑256. Maks. 20 aktywnych tokenów na użytkownika.

### Token w `.env`

Token z zapisem zapisany lokalnie jako `PROD_API` (plik `.env` jest w `.gitignore`):

```bash
export API=https://fabulous-dieffenbachia.netlify.app/api
export TOKEN=$(grep '^PROD_API=' .env | cut -d= -f2-)
alias qz='curl -sS -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json"'

qz $API/health           # {"ok":true}
```

Skrypty Node: `node --env-file=.env scripts/….mjs`.

## 2. Tokeny API (JWT)

| Metoda | Ścieżka | Opis |
| ------ | ------- | ---- |
| GET | `/tokens` | lista własnych tokenów |
| POST | `/tokens` | `{ "name": "CI", "expiresInDays": 30\|90\|365\|null, "write": false }` → 201, pole z surowym tokenem widoczne **tylko tu**. 403 gdy `write: true` a konto nie jest adminem; 409 przy limicie 20 |
| DELETE | `/tokens/:id` | unieważnia token |

## 3. Quizy (`write:quizzes`)

| Metoda | Ścieżka | Uprawnienie | Opis |
| ------ | ------- | ----------- | ---- |
| GET | `/quizzes?difficulty=easy\|medium\|hard&sort=recent\|popular` | każdy | lista (bez quizów generowanych) |
| GET | `/quizzes/:id` | każdy | widok gracza – bez `isCorrect`, wyjaśnień i opcji pytań `text` |
| GET | `/quizzes/:id?include=answers` | `write:quizzes` | widok edytora z poprawnymi odpowiedziami |
| POST | `/quizzes` | `write:quizzes` | tworzy quiz → 201 + pełny quiz |
| PUT | `/quizzes/:id` | `write:quizzes` | **zastępuje** wszystkie pytania i opcje (ich id się zmieniają) |
| DELETE | `/quizzes/:id` | `write:quizzes` | usuwa quiz; podejścia zostają (`quiz_title` jest zapisany) |
| POST | `/quizzes/:id/grade` | każdy | ocenia odpowiedzi i zapisuje podejście – nie używaj do testów na produkcji, bo zmienia statystyki i powtórki konta |

### Ciało quizu (`POST`/`PUT`)

```json
{
  "title": "Tytuł (1–200)",
  "description": "opcjonalnie, do 2000",
  "difficulty": "easy | medium | hard | null",
  "questions": [
    {
      "type": "single | multiple | truefalse | text",
      "prompt": "Treść (1–2000)",
      "explanation": "opcjonalnie",
      "points": 1,
      "options": [{ "text": "…", "isCorrect": true }],
      "verbId": 123
    }
  ]
}
```

Reguły (1–100 pytań, do 20 opcji na pytanie):

| `type` | Wymagane opcje |
| ------ | -------------- |
| `single` | ≥2 opcje, dokładnie 1 poprawna |
| `multiple` | ≥2 opcje, ≥1 poprawna (ocena: zbiór musi się zgadzać w całości) |
| `truefalse` | dokładnie 2 opcje (np. „Prawda”/„Fałsz”), 1 poprawna |
| `text` | opcje = **akceptowane odpowiedzi** (wszystkie `isCorrect: true`); porównanie po `trim` + małe litery, bez dalszej normalizacji – wypisz warianty zapisu (spacje, przecinki, myślniki) |

`verbId` (opcjonalne) podpina pytanie pod czasownik z katalogu – ocena takiego pytania aktualizuje powtórki (Leitner).

### Przykład: utwórz, podejrzyj, usuń

```bash
ID=$(qz -X POST $API/quizzes -d '{
  "title":"Test","questions":[{"type":"text","prompt":"go – past?","options":[{"text":"went","isCorrect":true}]}]
}' | jq -r .id)

qz "$API/quizzes/$ID?include=answers" | jq '.questions[].options'
qz -X DELETE $API/quizzes/$ID
```

### Seedowanie quizu z pliku – `scripts/seed-list-quiz.mjs`

Tworzy (lub aktualizuje – dopasowanie po tytule, więc jest idempotentny) quiz „Czasowniki nieregularne – lista z docs/lista.md”:
jedno pytanie `text` na wiersz `docs/lista.md` (`Polskie — base, past, participle.`), z akceptowanymi wariantami zapisu.
Literówka „de-al/de-alt” w liście jest poprawiana na `deal/dealt`.

```bash
node scripts/seed-list-quiz.mjs --dry-run              # tylko parsowanie
node --env-file=.env scripts/seed-list-quiz.mjs        # produkcja (PROD_API)
API_URL=http://localhost:8888 node --env-file=.env scripts/seed-list-quiz.mjs   # lokalnie – wymaga tokenu z lokalnej bazy
```

Po zmianie `docs/lista.md` wystarczy uruchomić ponownie – quiz zostanie zastąpiony (id pytań się zmienią).

## 4. Quizy generowane i nauka (wszyscy zalogowani)

| Metoda | Ścieżka | Opis |
| ------ | ------- | ---- |
| GET | `/irregular-verbs?difficulty=&popularity=&pattern=AAA\|ABA\|ABB\|ABC` | katalog czasowników |
| POST | `/quizzes/generate/irregular-verbs` | `{ count: 5–50, difficulty?, popularity?, variant: mixed\|typing\|choice\|translation, onlyWeak? }` → 201 |
| POST | `/quizzes/:id/retry-wrong` | nowy quiz z błędnie odpowiedzianych |
| GET | `/courses`, `/courses/:id`, `/courses/:id/lessons/:lessonId` | kursy i lekcje |
| POST | `/courses/:id/lessons/:lessonId/complete` | ukończenie lekcji |
| POST | `/courses/:id/exam` | egzamin kursu (`{ count: 5–40 }`; 409 przed ukończeniem lekcji) |
| GET | `/attempts` | historia podejść zalogowanego |
| GET | `/reviews/summary`, POST `/reviews/session` | powtórki w odstępach |
| GET | `/progress/summary`, `/progress/weak-verbs`; PATCH `/progress/profile` | postępy, trudne czasowniki, cel dzienny/strefa |

Quizy generowane (`kind = generated`) nie pojawiają się na liście `/quizzes` i nie są sprzątane.

## 5. Klasy nauczyciela (rola `teacher`, `manage:classes`)

Nauczyciel widzi tylko własne klasy (cudze wyglądają jak 404).

| Metoda | Ścieżka | Opis |
| ------ | ------- | ---- |
| GET/POST | `/classes` | lista / utworzenie klasy |
| GET/PATCH/DELETE | `/classes/:id` | szczegóły / zmiana / archiwizacja |
| POST | `/classes/:id/code` | nowy kod dołączenia (6 znaków) |
| DELETE | `/classes/:id/members/:userId` | usunięcie ucznia |
| POST | `/classes/:id/assignments` | zadanie: kurs **albo** quiz, opcjonalny termin |
| DELETE | `/classes/:id/assignments/:assignmentId` | usunięcie zadania |
| GET | `/classes/:id/report`, `/classes/:id/report.csv` | raport (CSV odporny na wstrzyknięcie formuł) |
| POST | `/classes/join` | uczeń: `{ code }` |
| GET | `/my/classes`, `/my/assignments`; DELETE `/my/classes/:id` | widok ucznia |

## 6. Panel admina (`manage:users`, tylko JWT admina)

Osobisty token dostanie tu **403**. JWT bierzesz z sesji przeglądarki (DevTools → Network → nagłówek `Authorization` dowolnego żądania do `/api`) – jest krótkotrwały, nie zapisuj go w repo.

| Metoda | Ścieżka | Opis |
| ------ | ------- | ---- |
| GET | `/admin/users?q=<fraza>&page=0` | użytkownicy z Auth0 (20 na stronę, `q` do 100 znaków) wraz z rolami |
| PUT | `/admin/users/:id/roles` | `{ "roles": ["admin"\|"teacher"\|"student", …] }` – ustawia dokładnie ten zestaw; inne role tenantu pozostają nietknięte |
| PATCH | `/admin/users/:id/blocked` | `{ "blocked": true\|false }` |
| GET | `/admin/feedback?status=new\|in_progress\|done` | zgłoszenia (maks. 200, najnowsze pierwsze) |
| PATCH | `/admin/feedback/:id` | `{ "status": "new\|in_progress\|done" }` |
| GET | `/admin/audit` | 100 ostatnich zmian administracyjnych |

Zabezpieczenia (zwracają **409**): nie odbierzesz sobie roli admin, nie odbierzesz jej ostatniemu adminowi, nie zablokujesz siebie ani ostatniego admina.
Każda zmiana ról/blokady/statusu uwag trafia do `admin_audit_log`. Zmiana ról działa po ponownym zalogowaniu użytkownika.
Management API Auth0 ma niski limit – serwer cache'uje role na 15 s i raz ponawia po 429; przy masowych operacjach zostaw przerwy.

```bash
JWT=…   # skopiowany z przeglądarki
adm() { curl -sS -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" "$@"; }

adm "$API/admin/users?q=kowalski" | jq '.'
adm -X PUT "$API/admin/users/auth0%7C123/roles" -d '{"roles":["teacher"]}'   # id zawiera „|” → %7C
adm "$API/admin/feedback?status=new" | jq '.[] | {id, kind, message}'
adm -X PATCH "$API/admin/feedback/<uuid>" -d '{"status":"done"}'
adm $API/admin/audit | jq '.[0:5]'
```

## 7. Feedback (każdy zalogowany)

`POST /feedback` – `{ kind: bug|idea|other, message (3–2000), userLabel?, context? }` → 201 `{ id }`.

## 8. Diagnostyka

| Objaw | Przyczyna |
| ----- | --------- |
| 401 + `WWW-Authenticate: Bearer` | brak/nieprawidłowy/odwołany/wygasły token |
| 403 na `/quizzes` (POST/PUT/DELETE) | token bez zapisu lub konto nie jest adminem |
| 403 na `/admin/*`, `/tokens` | token osobisty – potrzebny JWT admina (`/tokens`: JWT dowolnego użytkownika) |
| 404 na zasobie, który istnieje | zły format id (wymagany UUID) lub cudza klasa |
| 500 `Invalid response status code` | handler zwrócił 204/304 (nie powinno się zdarzyć – patrz konwencje w `CLAUDE.md`) |
| lokalnie 404 zamiast 403 | quirk `netlify dev` – proxy ponawia 403 jako `/index.htm`; na produkcji jest prawdziwe 403 |

Przy błędzie 5xx weź `requestId` z odpowiedzi / `X-Request-Id` i znajdź zdarzenie w Sentry (`docs/sentry.md`).
