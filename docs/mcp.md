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
| zwykły | `list_quizzes`, `get_quiz` (widok gracza), `get_quiz_schema`, `list_irregular_verbs` |
| z prawem zapisu (tworzy admin) | dodatkowo `get_quiz` z `withAnswers`, `create_quiz`, `update_quiz`, `delete_quiz` |
| z dostępem do klas (tworzy nauczyciel) | `list_classes`, `get_class_report`, `get_student_results`, `analyze_student` – tylko dla własnych klas nauczyciela |

Token z dostępem do klas tworzysz w Ustawieniach → Tokeny API przełącznikiem „Klasy i wyniki uczniów” (widoczny dla nauczyciela; `POST /api/tokens` z `classes: true`). Pokazuje imiona, e‑maile i wyniki uczniów, więc traktuj go jak dane osobowe: podawaj go tylko usłudze, której możesz je powierzyć. Admin nie ma tego dostępu automatycznie – potrzebuje roli nauczyciela.

Zarządzanie użytkownikami/uwagami i tokenami nie jest dostępne przez MCP (wymaga sesji admina, patrz `docs/api-admin.md`). Token daj asystentowi tylko wtedy, gdy ufasz temu usługodawcy – ma on prawo zapisu do wszystkich quizów.

## Narzędzia

| Narzędzie | Opis |
| --------- | ---- |
| `list_quizzes` | lista quizów (`difficulty`, `sort`) |
| `get_quiz` | quiz po `id`; `withAnswers: true` zwraca poprawne odpowiedzi i ustawienia (zapis) |
| `get_quiz_schema` | JSON Schema obiektu quizu (jak `data/quiz.schema.json`) |
| `list_irregular_verbs` | katalog czasowników nieregularnych jako materiał na quizy (do 100) |
| `create_quiz` | tworzy quiz (`quiz` zgodny ze schematem) |
| `update_quiz` | zastępuje cały quiz i jego ustawienia (id pytań się zmieniają) |
| `delete_quiz` | usuwa quiz; wymaga `confirm: true` |
| `list_classes` | klasy nauczyciela |
| `get_class_report` | uczniowie klasy z postępem w zadaniach, lekcjami, aktywnością, słabymi czasownikami |
| `get_student_results` | surowe wyniki ucznia: zadania i podejścia z odpowiedziami na pytania |
| `analyze_student` | gotowa analiza ucznia: średnia, trend, zadania po terminie, dni bez aktywności, najtrudniejsze pytania, najsłabsze czasowniki i ostrzeżenia |

Analiza ucznia: `list_classes` → `get_class_report` (wybierz ucznia, weź jego `userId`) → `analyze_student` (a po szczegóły `get_student_results`). Wnioski i rekomendacje pisze asystent na podstawie zwróconych danych; narzędzie liczy tylko statystyki.

Dobry przepływ dla asystenta przy quizach: `get_quiz_schema` → (opcjonalnie `list_irregular_verbs`) → `create_quiz` → `get_quiz` do sprawdzenia. Przy zmianie: `get_quiz` z `withAnswers`, modyfikacja, `update_quiz`.

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

## Szybki test z linii poleceń

```bash
curl -s -X POST $API/mcp -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

`GET`/`DELETE /api/mcp` zwracają 405 (serwer jest bezsesyjny, tylko `POST`).
