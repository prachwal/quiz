# Synchronizacja danych Netlify DB → Vercel (Neon)

Skrypt `scripts/sync-db.mjs` kopiuje dane z bazy Netlify do bazy Neon podpiętej do projektu Vercel.
Schematu nie tworzy — najpierw uruchom migracje na celu.

## Wymagania

- `netlify` CLI zalogowany do projektu (źródło jest czytane przez `netlify database status` i jest **read-only**),
- `DATABASE_URL` / `TARGET_DATABASE_URL` bazy Neon (np. z `vercel env pull`),
- migracje zaaplikowane na cel: `npm run db:migrate`.

## Użycie

```bash
# podgląd bez zapisu
npm run db:sync -- --dry-run

# pełna synchronizacja (cel musi być pusty albo podaj --replace)
npm run db:sync -- --replace

# źródło z pliku env, cel wprost
npm run db:sync -- --from "$NETLIFY_DB_URL" --to "postgres://…" --replace

# tylko wybrane tabele
npm run db:sync -- --tables quizzes,questions,options --replace
```

## Co robi

1. Czyta listę tabel ze źródła i porównuje z celem (brak tabeli = błąd z podpowiedzią `npm run db:migrate`).
2. Ustala kolejność tabel na podstawie kluczy obcych (dzieci po rodzicach).
3. W jednej transakcji: `TRUNCATE … CASCADE` (przy `--replace`), `INSERT` partiami, `setval` sekwencji.
4. Weryfikuje liczbę wierszy każdej tabeli; przy różnicy robi `ROLLBACK`.
5. Kopiuje identyfikatory (UUID i `SERIAL`) bez zmian — powtórzenia i powiązania zostają spójne.

Pomijana jest tylko tabela `schema_migrations` (historia migracji celu).

## Opcje

| Opcja | Znaczenie |
| --- | --- |
| `--from <url>` | connection string źródła; domyślnie Netlify CLI |
| `--to <url>` | cel; domyślnie `TARGET_DATABASE_URL` lub `DATABASE_URL` |
| `--branch <name>` | gałąź Netlify DB (domyślnie `production`) |
| `--tables a,b` | tylko wskazane tabele |
| `--exclude a,b` | pomiń wskazane tabele |
| `--replace` | wyczyść cel przed kopiowaniem (wymagane, gdy cel ma dane) |
| `--dry-run` | tylko raport liczby wierszy |
| `--batch <n>` | wierszy na `INSERT` (domyślnie 500) |

## Uwagi

- **Wyeksportowane `DATABASE_URL` w shellu wygrywa z `--env-file`.** Jeśli w sesji został stary connection string, uruchom `env -u DATABASE_URL node --env-file=.env.local scripts/sync-db.mjs …` albo podaj `--to` wprost.
- Sekwencje są ustawiane na `MAX(id)` po kopiowaniu, więc nowe rekordy nie kolidują.
- Skrypt nie przenosi ról, uprawnień ani rozszerzeń — tylko dane tabel z `public`.
- Nie uruchamiaj go równolegle z zapisami do źródła; spójność zapewnia jedna transakcja po stronie celu, ale źródło czytane jest bez snapshotu.
