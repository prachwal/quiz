---
tags:
  - docs
  - mcp
created: 2026-10-19
updated: 2026-10-19
---

# Dodanie serwera MCP quizu do Grok (OAuth przez Auth0)

Grok łączy się ze zdalnymi serwerami MCP przez OAuth, więc zamiast tokenu `qz_…` używa logowania Auth0 – jak w aplikacji.
Asystent działa wtedy z uprawnieniami **zalogowanego użytkownika** (admin: zapis quizów; nauczyciel: klasy i wyniki uczniów).
Ogólny opis serwera i narzędzi: [mcp.md](mcp.md).

> Stan: konfiguracja po stronie Auth0 jest wykonana, a przebieg logowania w Grok był testowany tylko do etapu wymiany kodu na token.
> Jeśli po dodaniu konektora lista narzędzi jest pusta, zobacz „Rozwiązywanie problemów”.

## 1. Dane do formularza „Kolektor niestandardowy”

| Pole | Wartość |
| ---- | ------- |
| Adres serwera MCP | `https://quiz-vercel-rho.vercel.app/api/mcp` |
| Identyfikator klienta | `uqhQ3SV4BdKL1cUvyZC735N4ZdaGw6el` (aplikacja Auth0 „Quiz MCP (Grok)”) |
| Klucz tajny klienta | **puste** – klient publiczny, tylko PKCE |
| Punkt końcowy autoryzacji | `https://dev-4xxb1z18b3z4hc6s.us.auth0.com/authorize` |
| Punkt końcowy tokenu | `https://dev-4xxb1z18b3z4hc6s.us.auth0.com/oauth/token` |
| Zakresy | `openid` |
| Metoda uwierzytelniania tokena | `none (tylko PKCE, zalecane)` |

Kroki:

1. W Grok otwórz dodawanie własnego konektora/serwera MCP i wpisz powyższe wartości.
2. Zapisz i zaloguj się na konto, którego używasz w quizie (Google = admin, Discord = uczeń; nauczyciel – konto z rolą `teacher`). Zaakceptuj ekran zgody.
3. Po powrocie do Grok sprawdź, czy widać narzędzia: `quiz_list`, `quiz_create`, `class_list`… (24 sztuki; bez uprawnień część z nich zwróci odmowę).
4. Poproś np.: „Wypisz moje klasy”, „Dodaj ucznia google-oauth2|123 do klasy 3A” albo „Utwórz quiz 10 pytań 1 z 4 o pierwiastkach”.

**Nie używaj** w tym formularzu `AUTH0_MGMT_CLIENT_ID/SECRET` (aplikacja „Quiz Management”). To sekret administracyjny tylko dla serwera; Grok ma dostać wyłącznie identyfikator klienta „Quiz MCP (Grok)”.

## 2. Jak to jest skonfigurowane w Auth0 (do odtworzenia)

Wymaga `auth0 login` na tenancie `dev-4xxb1z18b3z4hc6s` z uprawnieniami do aplikacji i ustawień tenanta.

```bash
# osobna aplikacja SPA dla Grok - tylko jego adres zwrotny, bez sekretu (PKCE)
auth0 apps create --name "Quiz MCP (Grok)" --type spa \
  --callbacks "https://grok.com/connectors-oauth-exchange-code/" \
  --origins "https://grok.com" --web-origins "https://grok.com" \
  --description "Grok connector for the quiz MCP server (PKCE, no secret)"
auth0 apps update <client_id> --grants code,refresh-token      # bez implicit

# formularz Grok nie pozwala podać parametru audience, więc ustawiamy go domyślnie dla tenanta
auth0 api patch tenants/settings --data '{"default_audience":"https://api.quiz.local"}'
auth0 api get tenants/settings | jq .default_audience
```

Dlaczego tak:

- **Osobna aplikacja** – adres zwrotny obcej usługi nie trafia do „Quiz SPA”, a dostęp Grok można odebrać, usuwając jedną aplikację.
- **Domyślny `audience`** – bez niego Auth0 wystawia token dla `/userinfo`, którego API quizu odrzuca (401), a Grok pokazuje „auth: unavailable” i pustą listę narzędzi. „Quiz SPA” podaje `audience` jawnie, więc ustawienie go nie zmienia. Cofnięcie: `auth0 api patch tenants/settings --data '{"default_audience":""}'`.
- **Adres zwrotny** `https://grok.com/connectors-oauth-exchange-code/` odczytano z logów Auth0 (`auth0 logs list --filter "type:f"`, komunikat „Callback URL mismatch”) – gdyby Grok zmienił adres, ten sam błąd pokaże nowy.

## 3. Rozwiązywanie problemów

| Objaw | Przyczyna / działanie |
| ----- | --------------------- |
| „Callback URL mismatch” przy logowaniu | adres z błędu dopisz do `--callbacks` aplikacji „Quiz MCP (Grok)”: `auth0 apps update <client_id> --callbacks "…"` (podaj wszystkie adresy) |
| Połączono, ale brak narzędzi / „auth: unavailable” | token wystawiony bez `audience` (sprawdź `auth0 logs list --filter "type:seacft"` – ma być `https://api.quiz.local`); ustaw domyślny `audience`, **usuń i dodaj konektor ponownie** (stary token zostaje) |
| Narzędzia są, ale zapis/klasy odmawiają | rola użytkownika: zapis quizów = admin, klasy i wyniki = nauczyciel; role zmienia admin w Ustawieniach → Użytkownicy, działają po ponownym zalogowaniu (usuń i dodaj konektor) |
| Grok nie przyjmuje formularza OAuth | użyj trybu z nagłówkiem/kluczem API (jeśli jest) z tokenem `qz_…` albo API xAI – patrz [mcp.md](mcp.md) |
| Chcesz odebrać dostęp Grok | usuń aplikację „Quiz MCP (Grok)” w Auth0 (`auth0 apps delete <client_id>`) i konektor w Grok |
