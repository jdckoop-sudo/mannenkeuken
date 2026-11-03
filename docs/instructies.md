# Mannenkeuken – instructies voor Claude (Discord ↔ sheet ↔ dashboard)

> **Dit bestand is de bron.** Het staat in de repo: `docs/instructies.md` (https://github.com/jdckoop-sudo/mannenkeuken/blob/main/docs/instructies.md). Na elke wijziging aan sync of dashboard werkt Claude dit bestand bij in dezelfde pull request. De projectinstructies in Claude hoeven dan alleen naar dit bestand te verwijzen.

Dit project is voor onze WoW: Forever-guild **Mannenkeuken** (Horde, guild-found, ~10 vrienden). Het wordt gebruikt door Jelle en Justin, elk met hun eigen Claude. Antwoord in het **Nederlands**. Werk alleen in de Mannenkeuken-server, de guild-sheet, de repo en het Supabase-project hieronder. Alles gaat via **Claude in Chrome** (we zijn daar ingelogd op Discord, Google, GitHub en Supabase) en, voor de code, via de GitHub-repo. Er is géén Discord-bot.

Twee vaste taken:
- **"Sync de guild"** – Discord-rollen, de Google Sheet en het dashboard op elkaar laten aansluiten (zie *Sync-werkwijze*).
- **Dashboard aanpassen** – nieuwe functies of fixes in de website (zie *Dashboard aanpassen*).

**Bij elke sync én elke dashboard-update eerst vragen: "Hebben jullie de guildbank al gekocht?"** – zolang die nog niet gekocht is (zie *Guildbank*).

---

## Vaste gegevens

| Wat | Waar |
|---|---|
| Discord-server | https://discord.com/channels/1565042335664971836 |
| Google Sheet | https://docs.google.com/spreadsheets/d/13fIA-FU6WWzJN3wFdUhWvhAwsXnjC2ruKZJEsyUgLJs/edit |
| Dashboard (live) | https://jdckoop-sudo.github.io/mannenkeuken/ |
| GitHub-repo | https://github.com/jdckoop-sudo/mannenkeuken (Jelle = eigenaar, Justin = collaborator) |
| Supabase-project | `mannenkeuken` (Europa) – SQL Editor: https://supabase.com/dashboard/project/uvnmgyhnqlibnvpivhdf/sql/new |
| Blizzard-API (experiment) | developer-client op https://develop.battle.net; de geheimen `BLIZZARD_CLIENT_ID` en `BLIZZARD_CLIENT_SECRET` staan alleen als GitHub Actions-secrets (Claude typt ze nooit in en vraagt er nooit naar). Testen: Actions → *Test Blizzard API* → Run workflow (`tools/blizzard-test.mjs`), of lokaal met `node --env-file=<privé .env buiten de OneDrive-map> tools/blizzard-test.mjs <character> <realm> [regio]` (zie `.env.example`; `.env`-bestanden staan in `.gitignore`; Claude leest zo'n bestand nooit uit). Alle characters ophalen naar `data/blizzard-characters.json`: Actions → *Update characters* (alleen handmatig; `tools/update-characters.mjs`; instellingen in `data/blizzard-config.json`). De characterpagina toont die gegevens onder "From the game" zodra het bestand bestaat |

### Sheet
- **Members**: kopregel 4, spelers vanaf regel 5. Kolommen: A Player (echte naam), B Character, C Race, D Class, E Role, F Level, G Profession 1, H Skill 1, I Profession 2, J Skill 2, K Cooking, L First Aid, M Fishing, N Key recipes, O Last updated, P Status (Main / Alt / Gestopt), Q Notes (opmerkingen, bijv. "Druid als back-up"). Een alt = een extra regel met Status = Alt.
- **Last updated (O) gaat automatisch**: het Apps Script van de sheet (project *Mannenkeuken Discord Sync*, functie `onEdit`) zet bij elke echte wijziging in een spelersregel de datum van vandaag (NL-tijd). Niet zelf invullen. Dezelfde waarde opnieuw typen of opmaak wijzigen over lege cellen telt niet.
- **Lists**: geldige waarden – A Race, B Class, C Profession. Let op geldige race/class-combinaties (bijv. Skyborne kan geen Priest zijn).
- **Addons** en **Guild Bank**: worden niet meer gebruikt; die staan nu op het dashboard.

### Dashboard (pagina's)
Home (eigen character + notes, guildoverzicht als grafiek met filters en tabelweergave, trades en events met Wowhead-links + hover, "For you": getagd in events en op de market + verzoeken die je kunt craften, guildoverzicht, bankgoud, events, releases) · Roster (incl. Notes) · Professions (met aantal spelers per beroep, eigen beroepsicoontjes + Wowhead-link met hover) · Trade Market (zoeken op item, reserveren, players taggen, beroep + skill bij verzoeken, filters; eigen listings bewerken, afronden en verwijderen; **My finished listings** toont je afgeronde listings met **Reopen** en **Delete**; items die niet stapelbaar zijn, zoals wapens en armor, krijgen automatisch aantal 1; je kunt alleen een item plaatsen dat je uit de zoeklijst kiest, en die lijst bevat alleen verhandelbare items; als je in de zoeklijst over een item hovert, verschijnt de Wowhead-tooltip met de eigenschappen, ook in de Guild Bank) · Raids & Events (weekagenda met icoontjes per soort, hoverkaartje en quest/dungeon-links met Wowhead-hover; specifieke rollen óf "just players" + aantal, players taggen, dungeon-/raidzoeker op de titel, quest help met questzoeker, WoW: Forever-releases) · Guild Bank (goud + Top donors, guildbank, Opie Bank) · Achievements · Addons & Settings · My profile (main + max. 2 alts) · speler- en characterpagina's. **Uiterlijk**: donker fantasy-thema (zwart/paars, goud, rood) in `css/style.css`, zonder Blizzard- of Wowhead-materiaal; rechtsboven staat naast je naam het icoon van de class van je main (in de kleur van die class).

Gegevens: de **sheet** is leidend voor level, beroepen en notes. De rest staat in **Supabase**: `players` (sheetnaam ↔ Discordnaam), `members` (browser ↔ speler), `profiles`, `alts`, `listings`, `listing_reservations`, `events` (+ `players_needed`, `pinged`, `quest_id`, `dungeon`), `signups`, `bank`, `bank_items`, `bank_reservations`, `gold_donations`, `addons`, `tips`.

### Inloggen op het dashboard (geen Discord-login meer)
- Rechtsboven **"Choose your player"**: je kiest je naam uit de lijst (`players`) en vult de **guildcode** in. Eén keer per browser; daarna onthouden. **"Switch player"** om te wisselen.
- Techniek: anonieme Supabase-login (Auth → *Allow anonymous sign-ins* staat aan) + functie `join_guild(code, speler)` → tabel `members`. Een speler kan meerdere browsers hebben (telefoon + pc); "eigen" rijen = rijen van dezelfde speler (`same_player`), gedeelde dingen = iedereen met de code (`is_member`). Max. 10 foute codes per uur.
- **De guildcode** staat alleen versleuteld in `private.settings`. Alleen Jelle zet of verandert hem, zelf, in de SQL Editor (Claude typt hem nooit in en vraagt er nooit naar):
  ```sql
  insert into private.settings (key, value)
  values ('guild_code_hash', extensions.crypt('NIEUWE-CODE', extensions.gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
  ```
- Nieuwe speler? Zodra hij in `players` staat (gebeurt bij de sync), staat hij in de keuzelijst.

### Guildbank en Opie Bank
De Guild Bank-pagina: bovenaan "How it works", het goud en **Top donors**; daaronder **Guild bank** en **Opie Bank**.
- **Opie Bank** is de bank-character. Leden mailen spullen **en guildgoud** in-game naar Opie Bank. **Jelle houdt de voorraad en het goudbedrag bij**; het goud wordt pas bijgewerkt als het binnen is.
- **Donaties**: bij **+ Add** kies je onder *From (donor)* van wie het goud komt → telt bij de pot op en komt in `gold_donations`. **Top donors** telt vanaf de launch. Onder *Latest donations* kun je een fout weghalen (gaat ook van de pot af).
- **"Send to Opie Bank"**: wie iets opstuurt, vult het in (*I sent this to Opie Bank*) → staat bij **"On its way"** tot Jelle op **Received** klikt. *Already in the inventory* = direct in de voorraad.
- **Guildbank (nu)**: we sparen **100 gold**. Items toevoegen/reserveren in de guildbank is nog dicht.
- **Vragen bij elke sync en update** of de guildbank al gekocht is. Zo ja: **"We bought the guild bank!"** (of `update public.bank set guild_bank_bought = true where id = 1;`) en het overgebleven goud invullen. Daarna hoeft de vraag niet meer.
- `bank_items`: `location` = `opie` of `guild`, `status` = `sent` of `in_stock`.
- **Activiteit en Top donors** tellen pas vanaf de WoW: Forever-launch (5 nov 2026, 00:00 NL-tijd; `LAUNCH` in `js/releases.js`). Wat daarvoor is ingevoerd, was testen.

---

## Wie is wie (sheet ↔ Discord)

| Sheet (Player) | Discord |
|---|---|
| Jelle | Dirk-Christiaan |
| Justin | Dokter Tinus |
| Bas | bas |
| Rawas | Daddy Draven |
| Jermo | Eterniity - Jermo |
| Jacco | Jaccico |
| Laurens | Le Noir |
| Mike | VDwerg |
| Murn | MURN |
| Yvo | Skynal |
| Mees | mjezzo |
| Ian | (nog onbekend – vragen) |

Deze lijst staat ook in Supabase in **`players`** (keuzelijst bij inloggen, taggen, koppeling). Verandert er iets, pas dan **beide** aan: `insert into public.players (player_name, discord_name) values ('Naam', 'Discordnaam') on conflict (player_name) do update set discord_name = excluded.discord_name;`
Nieuw Discord-lid zonder koppeling: gebruik de Discordnaam als Player en vraag daarna de echte naam. Bij twijfel: vragen, niet gokken.

---

## Discord-rollen
- **Mannen**: iedereen heeft deze rol, bewust met beheerdersrechten. Nieuwe leden krijgen hem via **Onboarding** (vraag 1 "Wat speel je? (Tank / Healer / DPS)" is verplicht en elk antwoord geeft óók Mannen).
- **Tank / Healer / DPS**: bóven Mannen in de rollenlijst en "afzonderlijk weergeven".
- **Race-, class- en beroeprollen**: precies dezelfde namen als in de sheet; alleen voor de **Main**.
- **Alts**: **Alt Tank**, **Alt Healer**, **Alt DPS** (geen kleur, niet apart weergeven). Bestaan ze nog niet: aanmaken bij de eerstvolgende sync. Race/class/beroepen van alts krijgen géén rol.

---

## Sync-werkwijze ("sync de guild")

**De sheet is leidend.** Bij een verschil krijgt Discord de waarde uit de sheet. Alleen regels met Status = Main tellen voor race/class/role/beroep-rollen.

0. **Vraag eerst of de guildbank al gekocht is** (zolang dat nog niet zo is).
1. **Sheet lezen**: in een sheet-tabblad `fetch()` op `…/gviz/tq?tqx=out:csv&sheet=Members&range=A5:Q200&headers=0` (en `sheet=Lists`).
2. **Discord lezen**: Serverinstellingen → Leden (`/member-safety`); per lid op "+N" klikken toont alle rollen. Negeer bots.
3. **Dashboard lezen** (SQL Editor): `select p.player_name, a.character_name, a.race, a.class, a.role from public.alts a left join public.profiles p using (user_id);` en idem voor `profiles`.
4. **Vergelijken**:
   - Speler in Discord maar niet in de sheet → nieuwe regel in Members (eerste lege regel vanaf 5), Status = Main, en toevoegen aan `players`.
   - Rol in Discord, veld leeg in de sheet → sheet invullen. Waarde in de sheet, rol ontbreekt/wijkt af → Discord gelijkzetten.
   - **Alt op het dashboard die niet in de sheet staat** → nieuwe regel met Player, Character, Race (zonder "(Horde)"), Class, Role, Status = Alt.
   - Iedereen heeft **Mannen**; alts → Alt Tank/Healer/DPS.
   - Status = **Gestopt** → race/class/role/beroep-rollen weghalen (Mannen blijft). **Altijd eerst tonen welke rollen eraf gaan en op akkoord wachten.**
   - Speler in de sheet maar niet in Discord → alleen melden.
   - Opmerkingen die geen recept zijn horen in **Notes (Q)**, niet in Key recipes (N).
5. **Eerst kort laten zien** wat er wordt aangepast en welke vragen er zijn, dan uitvoeren.
6. **Uitvoeren**, tabbladen sluiten en samenvatten: wat er in sheet / Discord / Supabase is aangepast, conflicten, wie nog niet gekoppeld is. (Last updated doet het script.)

---

## Dashboard aanpassen

- **Vraag eerst of de guildbank al gekocht is** (zolang dat nog niet zo is).
- Lees eerst **README.md** en **CLAUDE.md** in de repo (technische regels: gewone HTML/CSS/JS, Engels op de site, `?v=__V__`, `confirm()` vóór verwijderen, `esc()`, `mine(user, uid)` voor "is dit van mij", enz.).
- Werk op een **eigen branch** (`jelle/…` of `tinus/…`), open een **pull request** en merge die. **Altijd eerst de laatste `main` ophalen.** Even in Discord melden waar je mee bezig bent.
- **Database**: wijziging in `supabase/schema.sql` (altijd `if not exists` / `drop policy if exists`) **én** uitvoeren in de SQL Editor, vóór de merge. RLS: persoonlijk via `same_player(user_id)`, gedeeld via `is_member()`.
- **Nieuwe sheetkolom**: altijd achteraan (na Q) en `js/sheet.js` bijwerken.
- **Publiceren** gaat automatisch bij elke merge (GitHub Actions). Even controleren op de live site.
- **Item- en questlijst** (`data/items.json`, `data/quests.json`): **dagelijks** automatisch bijgewerkt; niet met de hand aanpassen. `items.json` bevat per item ook de stapelgrootte (`stack`, 1 = niet stapelbaar); de Trade Market gebruikt die voor het aantal. Naast de volledige lijst bouwt de workflow `data/tradeable-items.json`: alleen items die verhandelbaar zijn (Bonding 0, 2 of 3 in de game-data: geen soulbound- en geen quest-items). De zoekfunctie van de Trade Market gebruikt die lijst en een listing kan alleen met een item uit die lijst geplaatst worden, dus niet met losse tekst (bij een ontbrekend bestand valt hij terug op de volledige lijst); `items.json` blijft de volledige itemlijst en wordt daarvoor niet aangepast. Staat `stack` er nog niet in, dan bouwt de workflow de lijst opnieuw op bij de eerstvolgende run (of start hem met de hand: Actions → Update items → Run workflow). Namen die leden typen en nog niet in een lijst staan, worden voor iedereen voorgesteld.
- **Dungeons/raids** (`js/dungeons.js`) en **WoW: Forever-releases** (`js/releases.js`, met `LAUNCH`): met de hand bijwerken als Blizzard iets nieuws aankondigt.
- **Na elke update dit bestand (`docs/instructies.md`) bijwerken in dezelfde pull request.**

---

## Praktische tips (Claude in Chrome)
- Sheet typen: via het naamvak (linksboven, ca. x=40, y=102) naar de cel, waarde exact zoals in Lists, Enter. Controleren met de CSV of een screenshot.
- Opmaak kopiëren in de sheet: de opmaakkwast werkt; Ctrl+Alt+V niet.
- Sheet-script: Uitbreidingen → Apps Script (*Mannenkeuken Discord Sync*); code via `monaco.editor.getModels()[0]`, opslaan met Ctrl+S. Fouten bij Uitvoeringen.
- Discord-rollen: echte klik op het modzicht-icoon in de rij → echte klik op "+" onder Rollen → het vinkje (`role="menuitemcheckbox"`) kan via JavaScript. Controleer of het menu bij het juiste lid hoort.
- Rolvolgorde: slepen werkt alleen in de linker rollenlijst binnen "Rol bewerken".
- Supabase SQL Editor: `monaco.editor.getModels()[0].setValue(…)`, dan Ctrl+Enter (waarschuwing "destructive operations" komt door `drop … if exists`). Daarna weg navigeren geeft "Leave site?": open liever een nieuw tabblad.
- Supabase-data lezen kan met `fetch()` vanaf een tabblad met het dashboard open (publieke sleutel uit `js/config.js`).
- Wachtwoorden, de guildcode, geheime sleutels en Supabase-instellingen opslaan doet de gebruiker zelf.

## Openstaand
- Ian: nog geen Discord-account gekoppeld.
- Yvo (Skynal): race leeg (Skyborne kan geen Priest). Bij de volgende sync vragen: Troll, Undead of Blood Elf.
- Guildbank: nog niet gekocht (sparen voor 100 gold).
- Nieuwe Forever-dungeons (Wowhead-id's) toevoegen aan `js/dungeons.js` zodra bekend.
- Blizzard-API: het testscript werkt met gewone (retail) WoW (getest op 3 nov 2026: level, class, race, laatste login en beroepen komen terug). WoW: Forever heeft eigen namespaces (`dynamic-forever-eu`, `profile-forever-eu`, gevonden op 3 nov 2026, een dag voor de launch). De realmlijst (`/data/wow/realm/index?namespace=dynamic-forever-eu`) bevatte toen alleen CAMWOW-testentries ("... Realm 1 PvE" enz.) en Bertrand Bakkebaard werd nog niet gevonden. Na de launch (4/5 nov 2026): realmlijst opvragen en de slug van onze PvE-realm kiezen; in `data/blizzard-config.json` `namespace` op `profile-forever-eu` zetten, `realm` invullen en `nameFormat` controleren (encode / hyphen / nospace); *Update characters* met de hand draaien; klopt het resultaat, dan in `.github/workflows/update-characters.yml` het schema (elk uur) aanzetten. Werkt het, dan kunnen level en beroepen automatisch uit de API komen in plaats van met de hand in de sheet. Tot die tijd gebruikt de site de API nergens voor.
- De oude Discord-app/-provider in Supabase wordt niet meer gebruikt; mag uit.
