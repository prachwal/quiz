---
tags:
  - docs
  - mcp
  - backend
created: 2026-10-19
updated: 2026-10-20
---

# Serwer MCP – quizy w asystentach AI

Aplikacja udostępnia serwer [Model Context Protocol](https://modelcontextprotocol.io) pod adresem

```
https://quiz-vercel-rho.vercel.app/api/mcp
```

(lokalnie: `http://localhost:8888/api/mcp` z `npm run dev:full`). To zdalny serwer HTTP (Streamable HTTP, bez sesji, odpowiedzi JSON), więc może z niego korzystać dowolny klient MCP: Claude, OpenAI, Grok, edytory itd.

## Uwierzytelnianie i uprawnienia

Tak samo jak REST API: nagłówek `Authorization: Bearer qz_…` z **osobistym tokenem** (Ustawienia → Tokeny API). Narzędzia działają z uprawnieniami tokenu:

| Token | Co może |
| ----- | ------- |
| zwykły | `quiz_list`, `quiz_get` (widok gracza), `quiz_schema`, `verbs_list` |
| z prawem zapisu (tworzy admin) | dodatkowo `quiz_get` z `withAnswers`, `quiz_create`, `quiz_update`, `quiz_delete` |
| z dostępem do klas (tworzy nauczyciel) | `class_*`, `student_*`, `assignment_*`, `course_list` – na własnych klasach nauczyciela |
| logowanie OAuth admina | podgląd wszystkich klas (`class_list` z `scope: "all"`, raporty, analizy); narzędzia administracyjne (`attempt_*`, `quiz_stats`, `user_*`, `class_transfer`, `audit_list`, `feedback_*`, `settings_*`, `system_stats`) |

Token z dostępem do klas tworzysz w Ustawieniach → Tokeny API przełącznikiem „Klasy i wyniki uczniów” (widoczny dla nauczyciela; `POST /api/tokens` z `classes: true`). Pokazuje imiona, e‑maile i wyniki uczniów, więc traktuj go jak dane osobowe: podawaj go tylko usłudze, której możesz je powierzyć. Admin nie ma tego dostępu automatycznie – potrzebuje roli nauczyciela.

Zarządzanie tokenami API nie jest dostępne przez MCP (wymaga sesji, patrz `docs/api-admin.md`). Użytkownicy, zgłoszenia, ustawienia i audyt są dostępne, ale tylko przez logowanie OAuth admina (sekcja „Administrator”). Token daj asystentowi tylko wtedy, gdy ufasz temu usługodawcy – ma on prawo zapisu do wszystkich quizów.

## Narzędzia

Nazwy mają postać `obiekt_czynność`. Operacje nieodwracalne wymagają `confirm: true`, a **każda zmiana wykonana przez MCP trafia do dziennika audytu** (Ustawienia → Audyt, akcja „Zmiana przez MCP”).

**Quizy** – odczyt dla każdego tokenu, zmiany z `write:quizzes`

| Narzędzie | Opis |
| --------- | ---- |
| `quiz_list` | lista quizów (`difficulty`, `subject` albo `none`, `sort`) |
| `quiz_get` | quiz po `id`; `withAnswers: true` zwraca poprawne odpowiedzi i ustawienia (zapis) |
| `quiz_schema` | JSON Schema obiektu quizu (jak `data/quiz.schema.json`) |
| `verbs_list` | katalog czasowników nieregularnych jako materiał na quizy (do 100) |
| `quiz_create` | tworzy quiz (`quiz` zgodny ze schematem) |
| `quiz_update` | zastępuje cały quiz i jego ustawienia (id pytań się zmieniają) |
| `quiz_delete` | usuwa quiz; wymaga `confirm: true` |

**Obrazy** – `write:quizzes`; obraz trafia do treści jako zapis `![opis](media:<id>)`. Składnię i to, gdzie wolno ją użyć, sprawdzaj w `quiz_schema`

| Narzędzie | Opis |
| --------- | ---- |
| `media_upload` | wysyła obraz (PNG, JPEG, WebP; do 2 MB po zdekodowaniu) w wywołaniu jako base64; zwraca `mediaId`, `url`, wymiary i gotowy `markdown`. Każdy znak base64 to tokeny, więc to ścieżka dla małych ilustracji |
| `media_upload_from_url` | serwer pobiera obraz z adresu `https` (zalecane dla większych plików); działa tylko przy `MEDIA_URL_FETCH=true` |
| `media_create_upload` | dla klientów z HTTP PUT: zwraca `uploadUrl` i `headers` podpisane na rozmiar; potem wysyłasz bajty i wołasz `media_complete` |
| `media_complete` | po PUT sprawdza w magazynie rozmiar, skrót i typ; niezgodny plik jest usuwany |
| `media_list` | pliki autora (admin widzi wszystkie i może podać `ownerId`); `unreferenced`, `limit`, `offset`, `total`, `hasMore` |
| `media_get` | metadane, adres i `referencedBy` (quizy, które używają pliku, z tytułami) |
| `media_delete` | usuwa plik (obiekt i wpis); wymaga `confirm: true`; odmawia, gdy quiz go używa, i podaje te quizy |
| `lesson_get` | lekcja kursu: tytuł, wstęp (`intro`) w zapisie przechowywanym, czasowniki (id i forma podstawowa), `referencedMedia` (id obrazów we wstępie); wymaga `write:quizzes` |
| `lesson_update` | zmienia tytuł (1–120 znaków) i/lub wstęp (do 2000 znaków; obrazy `![opis](media:<id>)`, najwyżej trzy, bez zewnętrznych adresów); pusty wstęp czyści obrazy; w audycie tylko długości, nie tekst; wymaga `write:quizzes` |

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

**Administrator** – `manage:users`, czyli **tylko logowanie OAuth** (token osobisty tego uprawnienia nigdy nie dostaje). Odczytywanie podejść **bez klasy i bez przydziału** – to uzupełnia `student_results`, które wymaga członkostwa w klasie.

| Narzędzie | Opis |
| --------- | ---- |
| `attempt_list` | podejścia wszystkich użytkowników, od najnowszego, z `total` i `hasMore`; filtry: `quizId`, `userId`, `courseId`, `title` (fragment tytułu zapisanego przy podejściu, więc działa też po usunięciu quizu), `source`, `minPercent`/`maxPercent`, `from`/`to`, `limit`/`offset` |
| `attempt_get` | jedno podejście: `score`/`maxScore`/`percent`, autor (z e-mailem), quiz i odpowiedź na **każde pytanie** (`type`, `points`, `earned`, `correct`, `answer`, `correctAnswers`); `prompt`/`type` = null, gdy pytanie zniknęło przy edycji quizu |

`attempt_list` zwraca `score` i `maxScore` wprost, więc „procent” nie wymaga zgadywania liczby punktów; `attempt_get` pokazuje, które pytania zawiodły. Statystyka pytań (`quiz_stats`) i pozostałe narzędzia administracyjne są zaprojektowane w [[MCP-Admin-Tools]].

Przepływy:

- **Nowa klasa:** `class_create` → `student_add` (po id Auth0) → `quiz_list`/`course_list` → `assignment_create`.
- **Analiza:** `class_list` → `class_analyze` (kogo sprawdzić) → `student_analyze` (szczegóły) → opcjonalnie `student_results` (odpowiedzi na pytania).
- **Quizy:** `quiz_schema` → (opcjonalnie `verbs_list`) → `quiz_create` → `quiz_get` do sprawdzenia; zmiana: `quiz_get` z `withAnswers`, modyfikacja, `quiz_update`.

Dodanie ucznia po id nie wymaga jego zgody – uczeń widzi klasę w „Zadania” i może ją opuścić. Nauczyciel widzi jego imię, e‑mail i wyniki z zadań klasy (patrz informacja przy dołączaniu).

**Administrator** – `quiz_get`/`quiz_list` czytają **każdy** quiz (nie tylko własny), a `quiz_update`/`quiz_delete` wymagają jedynie `write:quizzes`, więc kontrola nad treścią quizów jest pełna. Wyniki poza klasą dają narzędzia z sekcji „Administrator” wyżej.

## Obrazy: ścieżki wysyłania i zabezpieczenia

Każda ścieżka kończy się tym samym: plik `ready` i odpowiedź z `mediaId`, `url`, wymiarami i `markdown`. Szczegóły zasad: [[Media-Storage-Plan]].

- **Typ** rozpoznaje serwer po pierwszych bajtach; deklaracja klienta się nie liczy. GIF i SVG są odrzucane.
- **Limity:** 2 MB na plik (`MEDIA_MAX_BYTES`), 100 plików i 50 MB dziennie na autora, 20 udanych pobrań z adresu na godzinę. Ten sam plik tego samego autora (ten sam skrót) to jeden wpis; ponowne wysłanie zwraca go z `reused: true`.
- **Audyt:** każda zmiana trafia do dziennika jako `mcp.call` z rozmiarem, źródłem i skrótem SHA-256 (nigdy bajty ani base64).

**Zabezpieczenia `media_upload_from_url` (SSRF)** – serwer wykonuje żądanie w imieniu klienta, więc:

- tylko `https`, port 443, bez loginu i hasła, adres do 2048 znaków;
- nazwy `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.localdomain` i nazwy bez kropki są odrzucane; adresy IP są sprawdzane (loopback, prywatne, link-local, metadane chmury `169.254.169.254`, zarezerwowane; adresy IPv4 zmapowane w IPv6, NAT64 i 6to4 według osadzonego IPv4);
- nazwa jest rozwiązywana **przed** połączeniem, **wszystkie** zwrócone adresy muszą być publiczne, a połączenie idzie na sprawdzony adres (obrona przed DNS rebinding);
- przekierowania: najwyżej 3, każde sprawdzane od nowa, przejście na `http` zakazane;
- limit czasu 8 s łącznie; limit 2 MB liczony na strumieniu, nie po `Content-Length`; wysyłane są tylko nagłówki `User-Agent` i `Accept` (bez ciasteczek, bez nagłówków klienta, bez ponownego użycia połączeń).

**Bramka `MEDIA_URL_FETCH`.** Domyślnie wyłączona: bez `MEDIA_URL_FETCH=true` narzędzie odmawia z komunikatem. Włączenie to decyzja właściciela, po sprawdzeniu na Vercelu, że połączenie jest przypięte do sprawdzonego adresu. Testy używają atrap DNS i transportu i niczego nie pobierają; przypięcie przez hak `lookup` nie zostało zweryfikowane na prawdziwym wdrożeniu. Lokalny `test:mcp` ustawia `MEDIA_URL_FETCH=false`.

**Znane ograniczenie:** limit godzinowy liczy wpisy utworzone przez pobranie. Nieudane pobranie i pobranie pliku, który już istnieje, nie są liczone, więc nie wydłużają ani nie skracają limitu.

## Podłączenie klientów

**Claude Code**

```bash
claude mcp add --transport http quiz https://quiz-vercel-rho.vercel.app/api/mcp \
  --header "Authorization: Bearer qz_…"
```

**Claude Desktop** (przez most stdio):

```json
{ "mcpServers": { "quiz": {
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://quiz-vercel-rho.vercel.app/api/mcp",
           "--header", "Authorization:Bearer ${QUIZ_TOKEN}"],
  "env": { "QUIZ_TOKEN": "qz_…" }
} } }
```

**OpenAI (Responses API)** i **Grok (xAI, Responses API)** – narzędzie typu `mcp` ze zdalnym serwerem:

```json
{ "type": "mcp", "server_label": "quiz",
  "server_url": "https://quiz-vercel-rho.vercel.app/api/mcp",
  "headers": { "Authorization": "Bearer qz_…" },
  "require_approval": "always" }
```

`require_approval` zostaw włączone dla narzędzi zapisujących, jeśli klient to wspiera. Przetestowane jest wywołanie oficjalnym klientem MCP SDK (lista narzędzi, tworzenie, odczyt, zamiana, usuwanie, odmowa bez prawa zapisu); konfiguracje powyżej dla Claude Desktop, OpenAI i Grok wynikają z ich dokumentacji i nie były uruchamiane na tych usługach.

**Konektory z logowaniem OAuth (Claude, ChatGPT, Mistral, Grok):** zamiast tokenu `qz_…` klient loguje użytkownika przez Auth0. Każdy klient ma własną aplikację Auth0 – patrz [Nowy klient OAuth](#nowy-klient-oauth-nowa-aplikacja-auth0). Szczegóły dla Grok: [mcp-grok.md](mcp-grok.md).

Krok po kroku dla wszystkich klientów (Claude, Claude Code, Claude Desktop, ChatGPT, OpenAI Responses API, Grok, Mistral, Cursor/VS Code) wraz z gotowymi danymi do formularzy, dodawaniem nowego klienta, odbieraniem dostępu i rozwiązywaniem problemów: **[mcp-clients.md](mcp-clients.md)**.

## Lokalny dostęp bez Auth0 (tylko `npm run dev:full`)

Do pracy lokalnej (curl, klienty MCP, skrypty) nie potrzebujesz tokenu `qz_…` ani logowania. W `.env.local` ustaw losowe `DEV_AUTH_TOKEN` (min. 16 znaków) i opcjonalnie `DEV_AUTH_ROLES` (`admin,teacher,student`, domyślnie `admin,teacher`) oraz `DEV_AUTH_USER_ID` (domyślnie `dev|local`), uruchom `npm run dev:full` i używaj go jak tokenu:

```bash
curl -H "Authorization: Bearer $DEV_AUTH_TOKEN" localhost:8888/api/classes?scope=all
claude mcp add --transport http quiz-local http://localhost:8888/api/mcp --header "Authorization: Bearer $DEV_AUTH_TOKEN"
```

Zapytanie działa wtedy jako `dev|local` z uprawnieniami wybranych ról (admin: zapis quizów i podgląd wszystkich klas; teacher: własne klasy – to konto jest właścicielem klas tworzonych w tym trybie). **Nie działa nigdzie poza lokalnym serwerem**: wymaga `LOCAL_DEV=true` (ustawia je tylko `scripts/dev-server.mjs`), braku `NODE_ENV=production` i braku znaczników runtime Vercela (`VERCEL=1`, `VERCEL_ENV`) – testy w `tests/devAuth.test.ts`; poza lokalnym serwerem zmienna jest ignorowana, a w logu pojawia się ostrzeżenie. Wdrożenie na Vercel nigdy nie ustawia `LOCAL_DEV`, więc bypass nie może się włączyć.

Ten sam mechanizm w przeglądarce: `VITE_DEV_AUTH_TOKEN` (ta sama wartość) pomija logowanie Auth0 w `npm run dev:full`, pokazuje pomarańczowy pasek „Tryb deweloperski” i działa jako `VITE_DEV_AUTH_USER_ID` z rolami `VITE_DEV_AUTH_ROLES`. Wartości `VITE_*` są wycinane z buildów produkcyjnych (sprawdzone: token nie trafia do bundla). Domyślnie jest wyłączone, bo zmienia konto, na którym pracujesz lokalnie.

## Pełny test lokalny

```bash
npm run test:mcp
```

`MCP_E2E_VIA_DEV=1 npm run test:mcp` powtarza te same sprawdzenia przez zbundlowaną funkcję za proxy `npm run dev:full`, a nie tylko na aplikacji w procesie.

Skrypt uruchamia `scripts/dev-server.mjs`, a gdy port 8888 jest już zajęty, używa działającego serwera i niczego nie zatrzymuje. Oficjalnym klientem MCP wywołuje **wszystkie 51 narzędzi** na prawdziwej aplikacji i bazie: poprawne scenariusze, walidację, odmowy dla innego nauczyciela, admina (tylko podgląd), tokenu bez uprawnień i bez potwierdzenia oraz wpisy w audycie. Dane testowe mają prefiks `mcp-e2e` i są usuwane przed i po teście; kod wyjścia ≠ 0 przy błędzie. Test produkcji (tylko quizy, tymczasowy quiz): `node scripts/mcp-smoke.mjs`.

## Szybki test z linii poleceń

```bash
curl -s -X POST $API/mcp -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

`GET`/`DELETE /api/mcp` zwracają 405 (serwer jest bezsesyjny, tylko `POST`).

## Nowy klient OAuth (nowa aplikacja Auth0)

Konektory w aplikacjach AI (claude.ai, ChatGPT, Le Chat, Grok…) logują użytkownika przez Auth0, a nie tokenem `qz_…`. Auth0 w tym tenancie **nie ma dynamicznej rejestracji klientów** (brak `registration_endpoint`), więc dla każdego klienta tworzymy osobną aplikację z jego adresem zwrotnym i podajemy jej Client ID w formularzu konektora.

Jak klient znajduje Auth0: odpowiedź 401 z `/api/mcp` ma w `WWW-Authenticate` parametr `resource_metadata`, który wskazuje `/.well-known/oauth-protected-resource/api/mcp` (RFC 9728, `server/protectedResource.ts`). Metadane zawierają adres tenanta Auth0 jako serwer autoryzacji. Funkcja `api-src/index.ts` obsługuje te ścieżki `/.well-known/…` obok `/api/*`.

Istniejące aplikacje:

| Klient | Aplikacja Auth0 | Adres zwrotny |
| ------ | --------------- | ------------- |
| Claude (claude.ai) | „Quiz MCP (Claude)”, `bH1zf4YpkRYRo4x9gQJdFo4CRrNEPvyq` | `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback` |
| ChatGPT | „Quiz MCP (ChatGPT)”, `sJXSXHmpybLDu3XKi1SsammcaD4FHuhs` | `https://chatgpt.com/connector/oauth/KyVUTbJemWMq` i `https://chatgpt.com/connector/oauth/t4V0BDhxcgpm` (każdy konektor ma własny) |
| Mistral (Le Chat) | „Quiz MCP (Mistral)”, `KXAj39YXvdtlFGS7pIyVePWq2HWykGp4` | `https://callback.mistral.ai/v1/integrations_auth/oauth2_callback` |
| Grok | „Quiz MCP (Grok)”, `uqhQ3SV4BdKL1cUvyZC735N4ZdaGw6el` | `https://grok.com/connectors-oauth-exchange-code/` |

### Dodanie nowego klienta

1. **Zdobądź adres zwrotny** (redirect URI) klienta: z jego dokumentacji albo z formularza konektora. Jeśli go nie masz, wykonaj próbę logowania z dowolnym Client ID – Auth0 zgłosi „Callback URL mismatch”, a właściwy adres znajdziesz w logu: `auth0 logs list --filter "type:f" --json` (pole `details.qs.redirect_uri`). Adres bywa unikalny dla konektora (np. końcówka w ChatGPT), więc po ponownym utworzeniu konektora może się zmienić.
2. **Utwórz aplikację** (publiczna SPA, PKCE, bez sekretu), osobną dla każdego klienta – dostęp jednego klienta można wtedy odebrać, usuwając jedną aplikację, a adres zwrotny obcej usługi nie trafia do „Quiz SPA”:

   ```bash
   auth0 apps create --name "Quiz MCP (<klient>)" --type spa \
     --callbacks "<adres zwrotny>" \
     --origins "https://<domena klienta>" --web-origins "https://<domena klienta>" \
     --description "<klient> connector for the quiz MCP server (PKCE, no secret)" --no-input --json
   ```

   Z odpowiedzi zapisz `client_id`. `token_endpoint_auth_method` ma być `none`.
3. **Wpisz w konektorze klienta:**
   - adres serwera: `https://quiz-vercel-rho.vercel.app/api/mcp`,
   - Client ID z kroku 2, **sekret pusty**,
   - jeśli formularz pyta o adresy (zamiast je wykrywać): Authorization URL `https://dev-4xxb1z18b3z4hc6s.us.auth0.com/authorize`, Token URL `https://dev-4xxb1z18b3z4hc6s.us.auth0.com/oauth/token`, scope `openid profile email offline_access`.
4. **Dopisz klienta do tabeli powyżej.**

Co jest już ustawione w tenancie i nie wymaga zmian dla kolejnych klientów: `default_audience` = `https://api.quiz.local` (formularze zwykle nie pozwalają podać `audience`; bez niego Auth0 wystawia token, który API odrzuca) i `allow_offline_access` w API (klienci proszą o `offline_access`).

### Rozwiązywanie problemów

| Objaw | Przyczyna i rozwiązanie |
| ----- | ----------------------- |
| „Callback URL mismatch” | dwie przyczyny: (1) w konektorze jest Client ID innej aplikacji (np. Grok) – porównaj `client_name` w logu z tabelą aplikacji; (2) konektor zostaĹ‚ usuniÄ™ty i utworzony ponownie, wiÄ™c ChatGPT wygenerowaĹ‚ nowy adres (`…/connector/oauth/<id>`) – dopisz go do `callbacks`, zachowujÄ…c stary (`auth0 api patch "clients/<client_id>" --json --data '{"callbacks":["<nowy>","<stary>"]}'`) |
| konektor dodany, ale lista narzędzi pusta, „auth: unavailable” | token bez `audience` (sprawdź `default_audience`) albo użytkownik bez dostępu do narzędzi (uprawnienia zależą od roli) |
| klient nie znajduje logowania i pyta o `/authorize` lub `/register` na naszej domenie | sprawdź `curl https://quiz-vercel-rho.vercel.app/.well-known/oauth-protected-resource/api/mcp` – ma zwrócić JSON, nie stronę aplikacji |
| błąd CORS / origin | dopisz domenę klienta do `--origins` i `--web-origins` aplikacji |
| odebranie dostępu klientowi | usuń jego aplikację: `auth0 apps delete <client_id>` oraz konektor po stronie klienta |

Nie używaj w formularzach klientów danych aplikacji „Quiz Management” (`AUTH0_MGMT_CLIENT_ID/SECRET`) – to sekret administracyjny tylko dla serwera.
