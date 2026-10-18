# Serwer MCP – quizy w asystentach AI

Aplikacja udostępnia serwer [Model Context Protocol](https://modelcontextprotocol.io) pod adresem

```
https://fabulous-dieffenbachia.netlify.app/api/mcp
```

(lokalnie: `http://localhost:8888/api/mcp` z `npx netlify dev`). To zdalny serwer HTTP (Streamable HTTP, bez sesji, odpowiedzi JSON), więc może z niego korzystać dowolny klient MCP: Claude, OpenAI, Grok, edytory itd.

## Uwierzytelnianie i uprawnienia

Tak samo jak REST API: nagłówek `Authorization: Bearer qz_…` z **osobistym tokenem** (Ustawienia → Tokeny API). Narzędzia działają z uprawnieniami tokenu:

| Token | Co może |
| ----- | ------- |
| zwykły | `quiz_list`, `quiz_get` (widok gracza), `quiz_schema`, `verbs_list` |
| z prawem zapisu (tworzy admin) | dodatkowo `quiz_get` z `withAnswers`, `quiz_create`, `quiz_update`, `quiz_delete` |
| z dostępem do klas (tworzy nauczyciel) | `class_*`, `student_*`, `assignment_*`, `course_list` – na własnych klasach nauczyciela |
| logowanie OAuth admina | podgląd wszystkich klas (`class_list` z `scope: "all"`, raporty, analizy) |

Token z dostępem do klas tworzysz w Ustawieniach → Tokeny API przełącznikiem „Klasy i wyniki uczniów” (widoczny dla nauczyciela; `POST /api/tokens` z `classes: true`). Pokazuje imiona, e‑maile i wyniki uczniów, więc traktuj go jak dane osobowe: podawaj go tylko usłudze, której możesz je powierzyć. Admin nie ma tego dostępu automatycznie – potrzebuje roli nauczyciela.

Zarządzanie użytkownikami/uwagami i tokenami nie jest dostępne przez MCP (wymaga sesji admina, patrz `docs/api-admin.md`). Token daj asystentowi tylko wtedy, gdy ufasz temu usługodawcy – ma on prawo zapisu do wszystkich quizów.

## Narzędzia

Nazwy mają postać `obiekt_czynność`. Operacje nieodwracalne wymagają `confirm: true`, a **każda zmiana wykonana przez MCP trafia do dziennika audytu** (Ustawienia → Audyt, akcja „Zmiana przez MCP”).

**Quizy** – odczyt dla każdego tokenu, zmiany z `write:quizzes`

| Narzędzie | Opis |
| --------- | ---- |
| `quiz_list` | lista quizów (`difficulty`, `sort`) |
| `quiz_get` | quiz po `id`; `withAnswers: true` zwraca poprawne odpowiedzi i ustawienia (zapis) |
| `quiz_schema` | JSON Schema obiektu quizu (jak `data/quiz.schema.json`) |
| `verbs_list` | katalog czasowników nieregularnych jako materiał na quizy (do 100) |
| `quiz_create` | tworzy quiz (`quiz` zgodny ze schematem) |
| `quiz_update` | zastępuje cały quiz i jego ustawienia (id pytań się zmieniają) |
| `quiz_delete` | usuwa quiz; wymaga `confirm: true` |

**Klasy** – nauczyciel (`manage:classes`) pracuje na swoich klasach; admin (`manage:users`, logowanie OAuth) ma **podgląd wszystkich klas**, ale nie zmienia cudzych

| Narzędzie | Opis |
| --------- | ---- |
| `class_list` | klasy; `scope: "all"` (admin) pokazuje klasy wszystkich nauczycieli |
| `class_get` | klasa z uczniami (id Auth0, imię, e‑mail) i zadaniami |
| `class_create` | tworzy klasę (zwraca kod dołączenia) |
| `class_update` | zmienia nazwę i/lub otwiera/zamyka zapisy (`joiningOpen`) |
| `class_regenerate_code` | nowy kod dołączenia; `confirm` |
| `class_archive` | archiwizuje klasę; `confirm` |
| `class_report` | uczniowie klasy z postępem w zadaniach, lekcjami, aktywnością |
| `class_analyze` | analiza całej klasy: wyniki zadań, uczniowie wymagający uwagi z powodami |

**Uczniowie**

| Narzędzie | Opis |
| --------- | ---- |
| `student_list` | uczniowie klasy (`classId`) lub wszystkich klas z zakresu (`scope`), z ich klasami |
| `student_search` | szuka kont do dodania po fragmencie imienia/e‑maila/id (min. 3 znaki, e‑mail zamaskowany) |
| `student_add` | dodaje ucznia po **identyfikatorze Auth0** (np. `google-oauth2|123`); konto musi istnieć |
| `student_remove` | usuwa ucznia z klasy; `confirm` |
| `student_results` | surowe wyniki: zadania i podejścia z odpowiedziami na pytania |
| `student_analyze` | analiza ucznia: średnia, trend, zadania po terminie, dni bez aktywności, najtrudniejsze pytania i czasowniki, ostrzeżenia |

**Zadania**

| Narzędzie | Opis |
| --------- | ---- |
| `course_list` | kursy do przydzielenia |
| `assignment_create` | przydziela klasie kurs lub quiz (`kind`, `targetId`, opcjonalny `dueAt`) |
| `assignment_update_due` | zmienia lub usuwa termin |
| `assignment_delete` | usuwa zadanie; `confirm` |

Identyfikator Auth0 ucznia widać w `student_list` i `class_get` oraz w Ustawieniach → Użytkownicy (kolumna użytkownika, pod nazwą).

Przepływy:

- **Nowa klasa:** `class_create` → `student_add` (po id Auth0) → `quiz_list`/`course_list` → `assignment_create`.
- **Analiza:** `class_list` → `class_analyze` (kogo sprawdzić) → `student_analyze` (szczegóły) → opcjonalnie `student_results` (odpowiedzi na pytania).
- **Quizy:** `quiz_schema` → (opcjonalnie `verbs_list`) → `quiz_create` → `quiz_get` do sprawdzenia; zmiana: `quiz_get` z `withAnswers`, modyfikacja, `quiz_update`.

Dodanie ucznia po id nie wymaga jego zgody – uczeń widzi klasę w „Zadania” i może ją opuścić. Nauczyciel widzi jego imię, e‑mail i wyniki z zadań klasy (patrz informacja przy dołączaniu).

## Podłączenie klientów

**Claude Code**

```bash
claude mcp add --transport http quiz https://fabulous-dieffenbachia.netlify.app/api/mcp \
  --header "Authorization: Bearer qz_…"
```

**Claude Desktop** (przez most stdio):

```json
{ "mcpServers": { "quiz": {
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://fabulous-dieffenbachia.netlify.app/api/mcp",
           "--header", "Authorization:Bearer ${QUIZ_TOKEN}"],
  "env": { "QUIZ_TOKEN": "qz_…" }
} } }
```

**OpenAI (Responses API)** i **Grok (xAI, Responses API)** – narzędzie typu `mcp` ze zdalnym serwerem:

```json
{ "type": "mcp", "server_label": "quiz",
  "server_url": "https://fabulous-dieffenbachia.netlify.app/api/mcp",
  "headers": { "Authorization": "Bearer qz_…" },
  "require_approval": "always" }
```

`require_approval` zostaw włączone dla narzędzi zapisujących, jeśli klient to wspiera. Przetestowane jest wywołanie oficjalnym klientem MCP SDK (lista narzędzi, tworzenie, odczyt, zamiana, usuwanie, odmowa bez prawa zapisu); konfiguracje powyżej dla Claude Desktop, OpenAI i Grok wynikają z ich dokumentacji i nie były uruchamiane na tych usługach.

**Grok (interfejs z formularzem OAuth):** szczegółowa instrukcja dodania konektora przez Auth0 jest w [mcp-grok.md](mcp-grok.md).

## Lokalny dostęp bez Auth0 (tylko `netlify dev`)

Do pracy lokalnej (curl, klienty MCP, skrypty) nie potrzebujesz tokenu `qz_…` ani logowania. W `.env` ustaw losowe `DEV_AUTH_TOKEN` (min. 16 znaków) i opcjonalnie `DEV_AUTH_ROLES` (`admin,teacher,student`, domyślnie `admin,teacher`) oraz `DEV_AUTH_USER_ID` (domyślnie `dev|local`), zrestartuj `netlify dev` i używaj go jak tokenu:

```bash
curl -H "Authorization: Bearer $DEV_AUTH_TOKEN" localhost:8888/api/classes?scope=all
claude mcp add --transport http quiz-local http://localhost:8888/api/mcp --header "Authorization: Bearer $DEV_AUTH_TOKEN"
```

Zapytanie działa wtedy jako `dev|local` z uprawnieniami wybranych ról (admin: zapis quizów i podgląd wszystkich klas; teacher: własne klasy – to konto jest właścicielem klas tworzonych w tym trybie). **Nie działa nigdzie poza `netlify dev`**: wymaga `NETLIFY_DEV=true`, braku `NODE_ENV=production` i kontekstu innego niż `dev` (testy w `tests/devAuth.test.ts`); poza lokalnym serwerem zmienna jest ignorowana, a w logu pojawia się ostrzeżenie.

Ten sam mechanizm w przeglądarce: `VITE_DEV_AUTH_TOKEN` (ta sama wartość) pomija logowanie Auth0 w `npm run dev`/`netlify dev`, pokazuje pomarańczowy pasek „Tryb deweloperski” i działa jako `VITE_DEV_AUTH_USER_ID` z rolami `VITE_DEV_AUTH_ROLES`. Wartości `VITE_*` są wycinane z buildów produkcyjnych (sprawdzone: token nie trafia do bundla). Domyślnie jest wyłączone, bo zmienia konto, na którym pracujesz lokalnie.

## Pełny test lokalny

```bash
npm run test:mcp
```

`MCP_E2E_VIA_DEV=1 npm run test:mcp` powtarza te same sprawdzenia przez prawdziwą funkcję za `netlify dev` (adapter Lambda i proxy), a nie tylko na aplikacji w procesie.

Skrypt uruchamia `netlify dev` (lokalna baza), a gdy port 8888 jest już zajęty, używa działającego serwera i niczego nie zatrzymuje. Oficjalnym klientem MCP wywołuje **wszystkie 25 narzędzi** na prawdziwej aplikacji i bazie: poprawne scenariusze, walidację, odmowy dla innego nauczyciela, admina (tylko podgląd), tokenu bez uprawnień i bez potwierdzenia oraz wpisy w audycie. Dane testowe mają prefiks `mcp-e2e` i są usuwane przed i po teście; kod wyjścia ≠ 0 przy błędzie. Test produkcji (tylko quizy, tymczasowy quiz): `node --env-file=.env scripts/mcp-smoke.mjs`.

## Szybki test z linii poleceń

```bash
curl -s -X POST $API/mcp -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

`GET`/`DELETE /api/mcp` zwracają 405 (serwer jest bezsesyjny, tylko `POST`).

**Claude (konektor w claude.ai, OAuth):** w „Dodaj konektor” podaj adres `https://fabulous-dieffenbachia.netlify.app/api/mcp`, a w ustawieniach zaawansowanych Client ID `bH1zf4YpkRYRo4x9gQJdFo4CRrNEPvyq` (aplikacja Auth0 „Quiz MCP (Claude)”, publiczna, PKCE, bez sekretu). Klient znajduje Auth0 przez `/.well-known/oauth-protected-resource` (RFC 9728, `server/protectedResource.ts`), a Auth0 nie ma dynamicznej rejestracji klientów, stąd stały Client ID. Gdyby Auth0 zgłosił „Callback URL mismatch”, dopisz adres z `auth0 logs list --filter "type:f"` do `--callbacks` tej aplikacji.
