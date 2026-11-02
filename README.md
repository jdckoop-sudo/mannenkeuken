# Mannenkeuken – Guild Dashboard

Website voor onze WoW: Forever-guild **Mannenkeuken** (Horde, guild-found).
De site is in het Engels; deze README is voor ons (Jelle & Tinus).

- **Live site:** https://jdckoop-sudo.github.io/mannenkeuken/
- **Hosting:** GitHub Pages (branch `main`, map `/`)
- **Data:** Google Sheet (roster + beroepen) en Supabase (trade market, tips, events)
- **Login:** "Choose your player" + gedeelde guildcode (anonieme Supabase-login; `members` koppelt browser ↔ speler, `join_guild()` checkt de code). Geen Discord-login meer.

## Pagina's

| Pagina | Bestand | Data | Status |
|---|---|---|---|
| Home | `index.html` | Sheet + Supabase | basis klaar |
| Roster | `roster.html` | Google Sheet (tab Members) | klaar |
| Professions | `professions.html` | Google Sheet | klaar |
| Trade Market | `market.html` | Supabase `listings` | klaar |
| Raids & Events | `events.html` | Supabase `events` (rollen óf `players_needed` = gewoon spelers; `pinged` = getagde spelers, zien het op Home; `quest_id` = gekozen quest), `signups`; questzoeker uit `data/quests.json` | klaar |
| Guild Bank | `bank.html` | Supabase `bank_items` (`location` opie/guild, `status` sent/in_stock), `bank` (goud) – Opie Bank-voorraad (bijgehouden door Jelle, leden melden wat ze opsturen) + guildbank (open na aankoop). Activiteit (sign-ups, trades, deposits, tips, addons) op spelerpagina's telt vanaf de launch (`LAUNCH` in `js/releases.js`) | klaar |
| Player / Character | `player.html?name=…`, `character.html?name=…` | Sheet + Supabase `profiles`, `alts`, `players` | klaar |
| Achievements | `achievements.html` | Sheet + Supabase | klaar |
| My profile | `profile.html` | Supabase `profiles`, `alts` (main automatisch uit de sheet) | klaar |
| Addons & Settings | `setup.html` | Supabase `addons` + `tips`, macros/settings in `js/guides.js` | klaar |

## Mappen

```
css/style.css        simpele wireframe-styling (later vervangen door het echte ontwerp)
js/config.js         publieke instellingen (Supabase URL + anon key, Discord server-id, sheet-id)
js/supabase.js       verbinding, inloggen met speler + guildcode, `mine()` (is dit van mijn speler?)
js/layout.js         menu bovenaan (nieuwe pagina? voeg hem hier toe)
js/sheet.js          leest de Google Sheet
supabase/schema.sql  tabellen + beveiligingsregels (eenmalig uitvoeren in Supabase)
```

## Afspraken

1. **Nooit direct op `main` werken.** Laat Claude per taak een branch maken: `jelle/...` of `tinus/...`.
2. Klaar? Laat Claude een **pull request** openen en merge hem. Even laten weten in Discord waar je mee bezig bent, zodat je niet tegelijk hetzelfde bestand aanpast.
3. **Geheimen nooit in de repo.** De Supabase *anon key* mag in `js/config.js`; de *service_role key* en het *Discord Client Secret* nooit.
4. Simpel houden: gewone HTML/CSS/JS, geen build-stap.

## Wat Tinus moet doen (eenmalig)

1. **GitHub-account** maken (gratis) als je die nog niet hebt, en je gebruikersnaam aan Jelle sturen.
2. De **uitnodiging accepteren** voor `jdckoop-sudo/mannenkeuken` (komt per mail, of via github.com/notifications).
3. In **je eigen Claude** GitHub koppelen en Claude toegang geven tot de repo `jdckoop-sudo/mannenkeuken`.
4. Eerste opdracht aan je Claude, bijvoorbeeld:
   > Lees README.md en CLAUDE.md in jdckoop-sudo/mannenkeuken. Maak een branch `tinus/events` en bouw de pagina Raids & Events volgens de wireframe. Open daarna een pull request.
5. Wil je in Supabase meekijken? Vraag Jelle om je uit te nodigen voor het Supabase-project (niet verplicht).

## Instellingen

- Google Sheet gedeeld als *Iedereen met de link kan bekijken* (nodig voor Roster/Professions). ✔
- Supabase-project `mannenkeuken` (regio Europa), `supabase/schema.sql` uitgevoerd. ✔
- Supabase → Authentication → URL Configuration: Site URL + redirect = de live site. ✔
- Supabase Auth: *anonymous sign-ins* aan. Guildcode alleen als hash in `private.settings` (wijzigen: zie `supabase/schema.sql`). De oude Discord-app/provider wordt niet meer gebruikt.
  Callback-URL: `https://uvnmgyhnqlibnvpivhdf.supabase.co/auth/v1/callback`
