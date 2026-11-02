# Mannenkeuken – Guild Dashboard

Website voor onze WoW: Forever-guild **Mannenkeuken** (Horde, guild-found).
De site is in het Engels; deze README is voor ons (Jelle & Tinus).

- **Live site:** https://jdckoop-sudo.github.io/mannenkeuken/
- **Hosting:** GitHub Pages (branch `main`, map `/`)
- **Data:** Google Sheet (roster + beroepen) en Supabase (trade market, tips, events)
- **Login:** Discord, via Supabase

## Pagina's

| Pagina | Bestand | Data | Status |
|---|---|---|---|
| Home | `index.html` | Sheet + Supabase | basis klaar |
| Roster | `roster.html` | Google Sheet (tab Members) | klaar |
| Professions | `professions.html` | Google Sheet | klaar |
| Trade Market | `market.html` | Supabase `listings` | klaar |
| Raids & Events | `events.html` | Supabase `events`, `signups` | **nog te bouwen** |
| Addons & Settings | `setup.html` | Supabase `tips` | klaar |

## Mappen

```
css/style.css        simpele wireframe-styling (later vervangen door het echte ontwerp)
js/config.js         publieke instellingen (Supabase URL + anon key, Discord server-id, sheet-id)
js/supabase.js       verbinding, Discord-login, check of je in de Discord-server zit
js/layout.js         menu bovenaan (nieuwe pagina? voeg hem hier toe)
js/sheet.js          leest de Google Sheet
supabase/schema.sql  tabellen + beveiligingsregels (eenmalig uitvoeren in Supabase)
```

## Afspraken

1. **Nooit direct op `main` werken.** Laat Claude per taak een branch maken: `jelle/...` of `tinus/...`.
2. Klaar? Laat Claude een **pull request** openen. De ander kijkt hem na en merget.
3. Verdeling: **Jelle** → Trade Market, Addons & Settings, Home. **Tinus** → Roster, Professions, Raids & Events.
4. **Geheimen nooit in de repo.** De Supabase *anon key* mag in `js/config.js`; de *service_role key* en het *Discord Client Secret* nooit.
5. Simpel houden: gewone HTML/CSS/JS, geen build-stap.

## Wat Tinus moet doen (eenmalig)

1. **GitHub-account** maken (gratis) als je die nog niet hebt, en je gebruikersnaam aan Jelle sturen.
2. De **uitnodiging accepteren** voor `jdckoop-sudo/mannenkeuken` (komt per mail, of via github.com/notifications).
3. In **je eigen Claude** GitHub koppelen en Claude toegang geven tot de repo `jdckoop-sudo/mannenkeuken`.
4. Eerste opdracht aan je Claude, bijvoorbeeld:
   > Lees README.md en CLAUDE.md in jdckoop-sudo/mannenkeuken. Maak een branch `tinus/events` en bouw de pagina Raids & Events volgens de wireframe. Open daarna een pull request.
5. Wil je in Supabase meekijken? Vraag Jelle om je uit te nodigen voor het Supabase-project (niet verplicht).

## Instellingen (al gedaan door Jelle)

- Google Sheet gedeeld als *Iedereen met de link kan bekijken* (nodig voor Roster/Professions).
- Supabase-project aangemaakt, `supabase/schema.sql` uitgevoerd, Discord-provider aangezet.
- Discord-app in het Discord Developer Portal, met de redirect-URL van Supabase.
- In Supabase → Authentication → URL Configuration: Site URL = de live site.
