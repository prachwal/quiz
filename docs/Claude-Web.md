---
tags:
  - mcp
  - docs
  - deploy
created: 2026-10-19
updated: 2026-10-19
---

# Claude web — konektor i opis narzędzi

Gotowe do wklejenia teksty dla konektora `Quiz` w claude.ai. Rejestracja i
uwierzytelnianie: [[mcp-clients]] · opis serwera: [[mcp]].

## 1. Formularz konektora

**Settings → Connectors → Add custom connector**, potem:

| Pole | Wartość |
| --- | --- |
| Name | `Quiz` |
| Remote MCP server URL | `https://quiz-vercel-rho.vercel.app/api/mcp` |
| OAuth Client ID | `bH1zf4YpkRYRo4x9gQJdFo4CRrNEPvyq` |
| OAuth Client Secret | **puste** (klient publiczny, tylko PKCE) |

Po **Connect** zaloguj się kontem, którego używasz w quizie: Google = admin,
konto z rolą `teacher` = nauczyciel, Discord = uczeń. Uprawnienia biorą się z roli,
więc ten sam konektor pokaże adminowi pełny zestaw narzędzi, a uczniowi tylko
odczyt.

## 2. Krótki opis (pole „description”, 1 akapit)

```text
Serwer quizów do nauki (Express + Postgres). Umożliwia przeglądanie i tworzenie
quizów (8 typów pytań: wybór, wielokrotny wybór, prawda/fałsz, tekst, liczba,
uporządkowanie, dopasowanie par, luki), zarządzanie klasami i uczniami,
przydzielanie kursów i quizów oraz czytanie wyników. Narzędzia nazywają się
obiekt_czynność. Każda zmiana wymaga uprawnień (admin zapisuje quizy, teacher
prowadzi swoje klasy) i trafia do dziennika audytu; operacje nieodwracalne
wymagają confirm: true. Wnioski o trudności pytań wyciągaj z wielu podejść, nie
z jednego.
```

## 3. Pełny opis narzędzi (Project instructions / Custom instructions)

Wklej poniższy blok do instrukcji projektu, w którym używasz konektora. Claude i
tak dostaje opisy narzędzi z serwera (`tools/list`), ale ten tekst mówi mu **w
jakiej kolejności i z jakimi zastrzeżeniami** ich używać.

```markdown
# Serwer quizów — jak używać narzędzi

Narzędzia mają nazwę `obiekt_czynność`. Każde wywołanie działa z uprawnieniami
zalogowanego użytkownika: uczeń tylko czyta, nauczyciel prowadzi swoje klasy,
admin tworzy i zmienia quizy oraz widzi wszystkie wyniki.

## Quizy
- `quiz_schema` — JSON Schema obiektu quizu (2020-12). Wywołaj **przed**
  `quiz_create`/`quiz_update`; to jedyne źródło prawdy o polach i limitach.
- `quiz_list` — quizy ręczne (filtry: `difficulty`, `subject`, `sort`). Quizy
  generowane (losowe, powtórki, trening błędów, egzaminy kursów) są tu ukryte.
- `quiz_get` — quiz z pytaniami; `withAnswers: true` dodaje poprawne odpowiedzi,
  wyjaśnienia i ustawienia (wymaga prawa zapisu).
- `quiz_create` — tworzy quiz; `quiz_update` **zastępuje całość** (identyfikatory
  pytań i opcji się zmieniają: pobierz `quiz_get` z odpowiedziami, zmień, wyślij);
  `quiz_delete` — usuwa, wymaga `confirm: true`.
- `verbs_list` — katalog czasowników nieregularnych (materiał na pytania).

Typy pytań i ich dane: `single`, `multiple`, `truefalse`, `text` trzymają
odpowiedzi w `options`; `numeric` (`config {answer, tolerance?}`), `ordering`
(`config {items: [{id, text}]}`), `matching` (`config {pairs: [{id, rightId, left,
right}]}`) i `cloze` (znaczniki `{{1}}…{{n}}` w treści + `config {gaps:
[{answers: []}]}`) trzymają je w `config`. Te dwa kształty się wykluczają —
`config` przy typie opcyjnym jest odrzucany.

## Klasy i uczniowie
- `class_list` → `class_get` — klasy i ich zawartość. `scope: "all"` (tylko admin)
  pokazuje klasy wszystkich nauczycieli; admin ma podgląd, ale nie zmienia cudzych
  klas.
- `class_create` → `student_add` → `assignment_create` — typowy przepływ
  zakładania klasy.
- `class_update` — nazwa i otwarcie/zamknięcie zapisów (`joiningOpen`);
  `class_regenerate_code` — nowy kod dołączenia (`confirm`); `class_archive` —
  archiwizacja (`confirm`).
- `student_search` — szuka kont po fragmencie imienia, e-maila lub id (min. 3
  znaki, e-mail zamaskowany). Zwraca identyfikator Auth0 potrzebny do
  `student_add`.
- `student_list`, `student_results`, `student_analyze` — wyniki ucznia **z klasy**;
  `student_results` działa tylko dla członka klasy. `student_remove` usuwa ucznia
  z klasy (`confirm`; jego wyniki zostają w aplikacji).
- `class_report`, `class_analyze` — raport i analiza całej klasy.
- `course_list` — kursy do przydzielenia; `assignment_create` przydziela klasie
  kurs albo quiz, `assignment_update_due` zmienia lub usuwa termin,
  `assignment_delete` usuwa zadanie (`confirm`).

## Wyniki poza klasą (tylko admin, tylko logowanie przez konektor)
- `attempt_list` — podejścia wszystkich użytkowników; filtry: `quizId`, `userId`,
  `courseId`, `title` (fragment tytułu zapisanego przy podejściu — działa też po
  usunięciu quizu), `source`, `minPercent`/`maxPercent`, `from`/`to`,
  `limit`/`offset`. Zwraca `total`, `hasMore` i `score`/`maxScore`/`percent`.
- `attempt_get` — jedno podejście: autor, quiz i odpowiedź na każde pytanie
  (`answer`, `correctAnswers`, `earned`, `points`). To właściwe narzędzie, gdy
  pytanie brzmi „dlaczego ten wynik wyszedł taki”.

## Zasady wnioskowania
1. Procent licz z `score`/`maxScore`, nie zgaduj liczby punktów z procentu.
2. Nie oceniaj trudności pytania po jednym podejściu. Jedno podejście mówi o
   odpowiedziach tej osoby, nie o pytaniu.
3. Przy małej liczbie podejść (np. 1–2 na pytanie) powiedz wprost, że danych
   jest za mało, zamiast stawiać hipotezę. Statystyka pytań w serwerze uznaje
   wynik za miarodajny dopiero od kilkunastu odpowiedzi.
4. `attempt_get` może mieć `prompt: null` — pytanie zmieniono lub usunięto po
   rozegraniu quizu; nie zgaduj jego treści.
5. Zmiany są nieodwracalne tylko tam, gdzie narzędzie wymaga `confirm: true` —
   nie wysyłaj `confirm` bez wyraźnej zgody użytkownika.
6. Każda zmiana trafia do audytu; nie powtarzaj operacji „na wszelki wypadek”.
```

## 4. Co Claude wie bez tego tekstu

`tools/list` zwraca nazwy, opisy i schematy wejścia każdego narzędzia, a także
podpowiedzi `readOnlyHint`/`destructiveHint`. Opis z sekcji 3 uzupełnia to o
kolejność wywołań, ograniczenia uprawnień i reguły wnioskowania — czyli o to,
czego nie da się wyczytać z pojedynczego schematu.

## 5. Sprawdzenie po podłączeniu

- Włącz konektor w rozmowie (ikona narzędzi → **Quiz**), potem poproś np. o
  „wypisz moje quizy”. Powinno pojawić się 27 narzędzi w `tools/list`.
- Uczeń zobaczy tylko narzędzia odczytu quizów — `class_*`, `student_*`,
  `assignment_*` i `attempt_*` odmówią z komunikatem o roli.
- Administrator wywoła `attempt_list`, ale **token `qz_…` tego nie potrafi** (nie
  ma `manage:users`); ten sam efekt da `node scripts/mcp-smoke.mjs`.
