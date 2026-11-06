# Mannenkeuken – instructies voor Claude (Discord ↔ dashboard)

> **Dit bestand is de enige bron.** Het staat in de repo: `docs/instructies.md` (https://github.com/jdckoop-sudo/mannenkeuken/blob/main/docs/instructies.md). De projectinstructies in Claude (bij Jelle en Justin gelijk) verwijzen alleen hiernaar en worden nooit meer aangepast: **alles wat verandert, verandert hier**, in dezelfde pull request als de wijziging zelf.

## Zo begin je (voor Claude, bij elk gesprek)
1. Zorg dat je **de nieuwste versie van dit bestand** hebt (in de repo: eerst `git fetch` en `origin/main` lezen; in de projectkennis: de versie uit de GitHub-koppeling). Kun je het niet lezen, zeg dat en vraag om de repo te koppelen of de projectkennis te syncen – niet gokken.
2. Vraag met wie je praat (Jelle of Justin) als dat niet duidelijk is.
3. Doe *Bij de start van elk gesprek* (onder *Samenwerken*): wat heeft de ander gedaan sinds de laatste PR van deze persoon, en waar is hij nu mee bezig.
4. Na 5 nov 2026: noem de punten onder *Na de launch (todo)*.
5. Werk daarna volgens dit bestand. Bij tegenspraak met oudere teksten (projectdocumenten, eerdere gesprekken) gaat dit bestand voor.

Dit project is voor onze WoW: Forever-guild **Mannenkeuken** (Horde, guild-found, ~10 vrienden). Het wordt gebruikt door Jelle en Justin, elk met hun eigen Claude. Antwoord in het **Nederlands**. Werk alleen in de Mannenkeuken-server, de repo en het Supabase-project hieronder. Alles gaat via **Claude in Chrome** (we zijn daar ingelogd op Discord, Google, GitHub en Supabase) en, voor de code, via de GitHub-repo. Er is géén Discord-bot.

Twee vaste taken:
- **"Sync de guild"** – Discord-rollen en het dashboard op elkaar laten aansluiten (zie *Sync-werkwijze*).
- **Dashboard aanpassen** – nieuwe functies of fixes in de website (zie *Dashboard aanpassen*).

**Bij elke sync én elke dashboard-update eerst vragen: "Hebben jullie de guildbank al gekocht?"** – zolang die nog niet gekocht is (zie *Guildbank*).

---

## Vaste gegevens

| Wat | Waar |
|---|---|
| Discord-server | https://discord.com/channels/1565042335664971836 |
| Dashboard (live) | https://jdckoop-sudo.github.io/mannenkeuken/ |
| GitHub-repo | https://github.com/jdckoop-sudo/mannenkeuken (Jelle = eigenaar, Justin = collaborator) |
| Supabase-project | `mannenkeuken` (Europa) – SQL Editor: https://supabase.com/dashboard/project/uvnmgyhnqlibnvpivhdf/sql/new |
| Blizzard-API (experiment) | developer-client op https://develop.battle.net; de geheimen `BLIZZARD_CLIENT_ID` en `BLIZZARD_CLIENT_SECRET` staan alleen als GitHub Actions-secrets (Claude typt ze nooit in en vraagt er nooit naar). Iedereen met repo-toegang kan de workflows starten met de client in GitHub. Om de scripts **lokaal** te draaien heeft ieder een eigen dev-client op Battle.net (zonder client geen data); zelf aanmaken op develop.battle.net → API Access → Create Client, en ID + secret zelf in een privé `.env` buiten de projectmap zetten. Testen: Actions → *Test Blizzard API* → Run workflow (`tools/blizzard-test.mjs`), of lokaal met `node --env-file=<privé .env buiten de OneDrive-map> tools/blizzard-test.mjs <character> <realm> [regio]` (zie `.env.example`; `.env`-bestanden staan in `.gitignore`; Claude leest zo'n bestand nooit uit). De echte update draait in Supabase (zie *Update characters: elke 15 minuten*) |

### Characters
- **Tabel `characters`**: speler, naam, race, class, role, level, beroepen (`professions`, lijst van naam + soort + skill), status (Main / Alt / Gestopt; op de site staat "Gestopt" als **Quit**, de waarde in de database blijft Nederlands), notes en key recipes. Een speler heeft maximaal één Main. Spelers wijzigen hun eigen characters op My profile, Jelle en Justin alles in developer mode (zie *Characters beheren*).
- **Main of Alt kiezen**: op **My profile** staat bij het main character de knop **Switch main** (de oude main wordt Alt; `set_main_character()`). Heeft een speler meerdere characters en geen main, dan vraagt My profile en Home om een keuze. Eén actief character is automatisch de main.
- **Last updated** gaat automatisch (`updated_at` en `updated_by`, gezet door de database).
- **Spelerkleuren**: elke speler heeft een eigen kleur. Elke link naar een spelerpagina krijgt die kleur (`--player-…` en de regels onderaan `css/style.css`), net als de titel op de spelerpagina. **Nieuwe speler**: kleur toevoegen in `css/style.css`.
- **Geldige waarden**: races, classes en roles staan in `js/wowdata.js`, beroepen in `js/dev-characters.js`. Let op geldige race/class-combinaties (bijv. Skyborne kan geen Priest zijn).

### Dashboard (pagina's)
**Menu en indeling (nieuwe opmaak, minder clutter)**: Home · **Guild** (tabbladen Members = `roster.html`, Overview = `overview.html`, Professions, Achievements; ook speler- en characterpagina's horen bij Guild) · **Market** · **Events** · **Bank** · **Tips** (= `setup.html`). My profile, My player page & stats, **Developer mode** (alleen Jelle en Justin) en Switch player zitten in het **menu onder je naam** rechtsboven. Menu in `pages` en de Guild-tabbladen in `GUILD_TABS` in `js/layout.js`. **Home**: niet ingelogd = één stap ("Choose your player") + tegels met wat waar staat + eerstvolgende release; ingelogd = My character (met class- en beroepsiconen), For you, Next event, Guild at a glance (cijfers + bankgoud). De guildoverzicht-grafiek staat nu op Guild → Overview, de releases op Events en de laatste trades op Market. Formulieren (New listing, Create event, Send to Opie Bank, Share a tip) klappen pas open met hun knop. **Bank**: spaardoel + "I sent something to Opie Bank" bovenaan; uitleg en Top donors inklapbaar; de **Bank manager** (saldo, + Add met donor, doel, "We bought the guild bank!", Received, donatie verwijderen) alleen in developer mode. **Professions**: per beroep character → speler → level (gesorteerd op **skill, hoogste bovenaan**, bij gelijke skill op level; de skill staat **vet** (het getal), het character-level gewoon; aanklikbaar) met skill, en onderaan twee rozendiagrammen (hoofdberoepen en secundaire) met het aandeel van elk beroep in de totale skill van de guild.

Details per pagina (namen van vóór de nieuwe opmaak): Home (eigen character + notes, guildoverzicht als grafiek met filters en tabelweergave, trades en events met Wowhead-links + hover, "For you": getagd in events en op de market + verzoeken die je kunt craften, guildoverzicht, bankgoud, events, releases; het blok **Guild at a glance** heeft acht tegels (leden, Tank/Healer/DPS, gemiddeld level, gemiddeld beroepslevel en hoogste level tellen **alleen de mains**; alts en gestopte characters tellen niet mee): leden (Main), **Alts**, Tank/Healer/DPS, **Gemiddeld beroepslevel** (gemiddelde van alle ingevulde beroepsskills, hoofd- en nevenberoepen, van alle characters; "online nu" tonen we niet omdat de API alleen de laatste login geeft), gemiddeld level, **Hoogste level**, **Topdonor van de guildbank** (sinds de launch, zelfde regel als op de Bank-pagina) en open listings; bedragen staan overal met goud-, zilver- en kopericonen) · Roster (**Status** – Main / Alt / Quit – als eerste kolom, vóór Player; het statusfilter staat standaard op **All** en de tabel staat standaard gesorteerd op **Level, hoogste bovenaan** (klik op een kolomkop om anders te sorteren); incl. Notes; boven de tabel staat een waarschuwing: characterinformatie wordt pas automatisch bijgewerkt zodra een character level 10 is, er draait elke 15 minuten een update, en cijfers veranderen pas nadat een speler is uitgelogd (dan geeft de API de nieuwste gegevens); tot level 10 staat er wat in de tabel `characters` staat; **er is bewust geen Last seen-kolom meer** (besloten op 5 nov 2026: de laatste login uit de API zegt niet of iemand echt online is). `activityOf()` en `ACTIVITY` in `js/players.js` bestaan nog, maar worden nu nergens getoond) · Professions (eerst de hoofdberoepen, daaronder apart **Secondary professions**: Cooking, First Aid en Fishing naast elkaar als rij van 3; met aantal spelers per beroep, eigen beroepsicoontjes + Wowhead-link met hover) · Trade Market (zoeken op item, reserveren, players taggen, beroep + skill bij verzoeken, filters; eigen listings bewerken, afronden en verwijderen; **My finished listings** toont je afgeronde listings met **Reopen** en **Delete**; items die niet stapelbaar zijn, zoals wapens en armor, krijgen automatisch aantal 1; je kunt alleen een item plaatsen dat je uit de zoeklijst kiest, en die lijst bevat alleen verhandelbare items; als je in de zoeklijst over een item hovert, verschijnt de Wowhead-tooltip met de eigenschappen, ook in de Guild Bank) · Raids & Events (weekagenda met icoontjes per soort, hoverkaartje en quest/dungeon-links met Wowhead-hover; specifieke rollen óf "just players" + aantal, players taggen, dungeon-/raidzoeker op de titel, quest help met questzoeker, WoW: Forever-releases) · Guild Bank (goud + Top donors, guildbank, Opie Bank) · Achievements · Addons & Settings · My profile (main + alts; je mag zelf max. 2 alts op de site maken, alts uit de sheet tellen niet mee en worden allemaal getoond, zodat de oude main na een Switch main altijd als alt terugkomt) · speler- en characterpagina's. **Uiterlijk**: donker fantasy-thema (zwart/paars, goud, rood) in `css/style.css`, zonder Blizzard- of Wowhead-materiaal. **Logo** = de flexende kookpot op een stenen schild (groene Horde-armen, stoofpot boven vuur, lint met MANNENKEUKEN; gemaakt met een beeldmodel, achtergrond uitgeknipt): `img/logo.png` (volledig, groot; voor Discord e.d.) en `img/logo.webp` (zelfde, licht; voor de site), `img/logo-mark.png` (alleen de flexende kookpot, aparte afbeelding; voor klein formaat lichter gemaakt met een gouden lichtrand; in de header, 58 px hoog) en `img/icon-128.png` + `img/favicon-32.png` + `img/apple-touch-icon.png` (dezelfde pot in een vierkant; favicon in de browserbalk en telefoon-snelkoppeling). `img/discord-icon.png` (512×512, transparant: de pot met lichtrand en warme gloed, armen steken iets uit) is het servericoon van Discord. Logo's worden niet bijgesneden. Het volledige logo (met lint) staat ook als vast watermerk (12% dekking) helemaal in beeld rechtsonder achter de pagina (`body::before` in `css/style.css`). Elke pagina heeft de icon-links in de `<head>`; nieuwe pagina → die drie regels meenemen. Rechtsboven staat naast je naam het icoon van de class van je main (in de kleur van die class).

Gegevens: voor level, race, class en beroepen geldt **API leidend, tabel `characters` als terugval** (zie *API of tabel: wie is leidend*); Player, Role, Status, Notes en Key recipes komen altijd uit de tabel. Alles staat in **Supabase**: `players` (spelernaam ↔ Discordnaam), `members` (browser ↔ speler), `characters`, `listings`, `listing_reservations`, `events` (+ `players_needed`, `pinged`, `quest_id`, `dungeon`), `signups`, `bank`, `bank_items`, `bank_reservations`, `gold_donations`, `addons`, `tips`.

### Inloggen op het dashboard (geen Discord-login meer)
- Rechtsboven **"Choose your player"**: je kiest je naam uit de lijst (`players`) en vult de **guildcode** in. Eén keer per browser; daarna onthouden. **"Switch player"** om te wisselen.
- Techniek: anonieme Supabase-login (Auth → *Allow anonymous sign-ins* staat aan) + functie `join_guild(code, speler)` → tabel `members`. Een speler kan meerdere browsers hebben (telefoon + pc); "eigen" rijen = rijen van dezelfde speler (`same_player`), gedeelde dingen = iedereen met de code (`is_member`). Max. 10 foute codes per uur.
- **De guildcode** staat alleen versleuteld in `private.settings`. Jelle of Justin zet of verandert hem, zelf, in de SQL Editor (Claude typt hem nooit in en vraagt er nooit naar):
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

## API of tabel: wie is leidend (weergave op de site)
Besloten op 5 nov 2026. De regels staan op één plek: `applyApi()` in `js/sheet.js` (gebruikt door `loadMembers()`, dus voor alle pagina's).
- **Kent de API het character** (`loadBlizzard()`, status `ok`): **level, race, class en beroepen met skill komen uit de API**. Andere beroepen in de tabel worden op de site vervangen; Cooking, First Aid en Fishing die de API niet meldt, verdwijnen. Meldt de API helemaal geen beroepen (aanroep mislukt of nog niets geleerd), dan blijven de beroepen uit de tabel staan.
- **Kent de API het character niet** (nog geen level 10, of een foutmelding): **de tabel is leidend**.
- **Altijd uit de tabel**: Player, Character (de naam), Role, Status, Notes en Key recipes; de API heeft die gegevens niet.
- **De tabel zelf wordt niet aangepast** door de API; dit gaat alleen over wat de site toont. De site toont overal de waarde van de API; er is geen vergelijking met wat in de tabel staat.
- **Skill wordt altijd als "/ 300" getoond** (besloten op 5 nov 2026), ook al geeft de API per beroep een lager maximum (in Forever nu 75 of 150).
- De kaart **Details** toont, als de API het character kent, ook **Last login** en **Last updated** (het laatste moment waarop de API-data is opgehaald, dus de laatste update van de pijplijn), allebei met datum en tijd in NL-tijd; kent de API het character niet, dan staat er bij *Last updated* de datum van de laatste wijziging in de characterlijst.

---

## Update characters: elke 15 minuten
De Blizzard-data komt uit **Supabase**: `pg_cron` start elke 15 minuten de Edge Function `update-characters` (`supabase/functions/update-characters/index.ts`). Die leest de namen uit de tabel `characters`, vraagt ze op bij de API en zet ze in de tabellen `blizzard_characters` (per character) en `blizzard_update` (laatste run). De site leest die tabellen via `loadBlizzard()` in `js/sheet.js`, dus nieuwe data vraagt geen commit, geen deploy en geen "New version"-balk.
- **Spelstatistieken**: de functie haalt per character ook `/achievements/statistics` op en bewaart vier tellers in het veld `stats`: `quests` (statistiek 98, Quests completed), `kills` (1197, Total kills), `deaths` (60, Total deaths) en `fish` (1518, Fish caught). Ontbreekt een statistiek in het antwoord, dan is die 0: de API laat weg wat nog nooit gebeurd is. Home (*Guild at a glance*) en de spelerspagina tonen de som met `gameTotals()` over alle characters die niet gestopt zijn, dus ook alts, zodat de spelers samen op het guildtotaal uitkomen. Characters onder level 10 tellen niet mee (de API kent ze nog niet) en gestopte characters vallen weg uit het totaal. Na een wijziging in de functie: opnieuw deployen in Supabase (handmatig, zie stap 2 hieronder). Tot de eerste run daarna blijven de tegels verborgen.
- **Waarom niet GitHub**: het GitHub-schema bleek op 5 nov 2026 onbetrouwbaar (runs om de paar uur of helemaal niet), en data in de repo gaf per update een commit op `main` plus een deploy.
- **Controleren**: developer mode → Checks → *Blizzard characters (database)* toont de laatste update en de aantallen, en wordt oranje als die ouder is dan een uur of als er een probleem was. In de SQL Editor: `select * from public.blizzard_update;`, `select * from cron.job_run_details order by start_time desc limit 10;` en `select * from net._http_response order by created desc limit 10;`. Logs: Edge Functions → update-characters → Logs.
- **Eenmalig instellen** (Jelle of Justin; Claude typt de geheimen nooit in en vraagt er nooit naar):
  1. Maak een lange willekeurige tekst (het *update-geheim*). Bewaar hem even in je wachtwoordmanager.
  2. Edge Functions → *Deploy a new function* → *Via Editor* → naam `update-characters` → plak `supabase/functions/update-characters/index.ts` → deploy. Zet daarna bij de functie **Enforce JWT verification uit** (de functie controleert zelf het update-geheim).
  3. Edge Functions → Secrets: `BLIZZARD_CLIENT_ID` en `BLIZZARD_CLIENT_SECRET` (de Battle.net-client; de waarden in GitHub zijn niet uit te lezen, dus kopieer ze van develop.battle.net) en `UPDATE_CHARACTERS_SECRET` (het update-geheim).
  4. SQL Editor: `select vault.create_secret('<het update-geheim>', 'update_characters_secret');`
  5. SQL Editor: voer `supabase/schema.sql` uit (maakt de tabellen en zet de timer aan).
  6. Test: wacht tot het volgende kwartier, of draai de `net.http_post` uit de cron-job in `schema.sql` één keer los, en kijk of `blizzard_update` gevuld is.
- **Dry run**: POST naar de functie met header `x-update-secret` en body `{"dryRun":true}` antwoordt wat hij vond en schrijft niets.
- **Een geheim vervangen**: het update-geheim staat op twee plekken die gelijk moeten zijn (functie-secret en Vault, zie het commentaar in `schema.sql`). Geeft de cron-job HTTP 401 in `net._http_response`, dan verschillen die.
- Stopt de update, dan blijft de site de laatste data tonen; Checks wordt dan oranje.

---

## Characters beheren (developer mode)
Developer mode → **Characters** toont de tabel `characters`. Jelle en Justin kunnen daar characters toevoegen, aanpassen en verwijderen; dat is meteen live.
- **Wat je ziet**: de tabel toont wat de site toont. Kent de game een character, dan komen level, race, class en beroepen daarvandaan en zijn die velden bij *Edit* niet aan te passen; player, naam, status, role, notes en key recipes wel.
- **Main**: een speler heeft maximaal één Main. Zet je een character op Main, dan wordt de vorige Main automatisch Alt. *Switch main* op My profile werkt de tabel ook bij (`set_main_character()`).
- **Nieuwe speler**: typ je een naam die nog niet in `players` staat, dan vraagt de site of die speler erbij moet. Die staat daarna ook bij "Choose your player". De Discord-naam komt bij de volgende sync.
- **Nieuwe characters** krijgen API-gegevens zodra ze level 10 zijn: de functie `update-characters` leest de namen uit deze tabel.

---

## Afspraken over characters
De Google Sheet is sinds 6 nov 2026 niet meer in gebruik; de tabel `characters` in Supabase is de bron.
- **Rechten**: de API blijft altijd leidend als hij een character kent. Een speler wijzigt alleen zijn eigen characters: naam, race, class en role zolang de API het character niet kent (onder level 10), daarna alleen de role. Level en beroepen komen vanzelf uit de API. Jelle en Justin kunnen alles aanpassen in developer mode. Geen limiet op het aantal alts. Quit-characters blijven bewaard (Status Gestopt). Dit wordt afgedwongen in de database (trigger `characters_guard` in `schema.sql`).
- **My profile**: een speler ziet zijn eigen characters uit de tabel (`js/my-characters.js`). Kent de game het character nog niet, dan zijn naam, race, class en role aan te passen; daarna alleen de role. Spelers voegen zelf characters toe, zonder limiet; de eerste wordt automatisch Main. Verwijderen kan alleen via developer mode.

---

## Wie is wie (speler ↔ Discord)

| Speler | Discord |
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
| Ian | Troy |
| Pim | pim3431 |

Deze lijst staat ook in Supabase in **`players`** (keuzelijst bij inloggen, taggen, koppeling). Verandert er iets, pas dan **beide** aan: `insert into public.players (player_name, discord_name) values ('Naam', 'Discordnaam') on conflict (player_name) do update set discord_name = excluded.discord_name;`
**Nieuwe speler (stap 11)**: voeg in developer mode → *Characters* een character toe en typ de nieuwe spelernaam; de site vraagt of de speler erbij moet (komt in `players`, en daarmee bij "Choose your player"). Zonder character kan ook: `insert into public.players (player_name, discord_name) values ('Naam', 'Discordnaam');`. Daarna kan de speler zelf inloggen en characters toevoegen op My profile. Zet de Discord-naam erbij (SQL hierboven), neem de speler op in deze lijst en geef hem een kleur (zie *Spelerkleuren*).
Nieuw Discord-lid zonder koppeling: gebruik de Discordnaam als speler en vraag daarna de echte naam. Bij twijfel: vragen, niet gokken.

---

## Discord-rollen
- **Mannen**: iedereen heeft deze rol, bewust met beheerdersrechten, **behalve Lurkers** (zie hieronder). Nieuwe leden krijgen hem via **Onboarding** (vraag 1 "Wat speel je? (Tank / Healer / DPS)" is verplicht en elk antwoord geeft óók Mannen).
- **Tank / Healer / DPS**: bóven Mannen in de rollenlijst en "afzonderlijk weergeven".
- **Race-, class- en beroeprollen**: precies dezelfde namen als op het dashboard; alleen voor de **Main**.
- **Alts krijgen géén Discord-rollen** (afspraak 3 nov 2026): alle rollen (Tank/Healer/DPS, race, class, beroep) gaan alleen over de **Main**. Alts staan alleen op het dashboard (Status = Alt). De rollen Alt Tank / Alt Healer / Alt DPS worden niet gebruikt.
- **Lurker** (5 nov 2026): voor leden die niet meespelen. Eigen rol, "afzonderlijk weergeven" (eigen groep in de ledenlijst, net als Tank/DPS). Rechten: kanalen bekijken, berichten sturen, berichtgeschiedenis, reacties, ingesloten links en bestanden; **geen** beheerder en geen spraak. Een Lurker heeft **alleen** de rol Lurker: geen Mannen, geen Tank/Healer/DPS, geen race-, class- of beroeprollen. Nu: empaty, MrWallie, Wessah en Skynal (Yvo, nog niet begonnen). Wordt iemand speler, dan haal je Lurker weg en geef je de gewone rollen (incl. Mannen) volgens het dashboard. De sync laat Lurkers met rust: ze tellen niet mee bij het gelijktrekken van rollen. Yvo staat wel in de sheet en op het dashboard (met de notitie "Lurker on Discord (has not started playing yet)"); die regels blijven zoals ze zijn.

---

## Sync-werkwijze ("sync de guild")

**Het dashboard is leidend voor Discord.** Bij een verschil krijgt Discord de waarde van het dashboard: de tabel `characters`, waarbij de API voorgaat als hij het character kent (zie *API of tabel*). Alleen characters met Status = Main tellen voor race/class/role/beroep-rollen. De sheet speelt geen rol meer.

0. **Vraag eerst of de guildbank al gekocht is** (zolang dat nog niet zo is).
1. **Dashboard lezen** (SQL Editor). Dit geeft per character wat de site toont:
   ```sql
   select c.player_name, c.name, c.status, c.role,
     coalesce(nullif(b.data->>'race', ''), c.race) as race,
     coalesce(nullif(b.data->>'class', ''), c.class) as class,
     coalesce((select jsonb_agg(p->>'name') from jsonb_array_elements(b.data->'professions') p where p->>'kind' = 'primary'),
              (select jsonb_agg(p->>'name') from jsonb_array_elements(c.professions) p where p->>'kind' = 'primary')) as professions
   from public.characters c
   left join public.blizzard_characters b on b.key = lower(btrim(c.name)) and b.data->>'status' = 'ok'
   order by c.player_name, c.status;
   ```
   En de spelers: `select player_name, discord_name from public.players;`. De API noemt sommige races anders: "Windshaper Skyborne" is de rol **Skyborne**.
2. **Discord lezen**: Serverinstellingen → Leden (`/member-safety`); per lid op "+N" klikken toont alle rollen. Negeer bots.
3. **Vergelijken**:
   - Lid in Discord maar niet in `players` → toevoegen (zie *Nieuwe speler*). Is het een Lurker, dan alleen melden.
   - Speler zonder Discord-naam → naam opzoeken en invullen, of vragen.
   - Speler in `players` zonder character → alleen melden; die voegt zelf een character toe op My profile.
   - Rol in Discord, veld leeg op het dashboard → vragen of het in de tabel moet (`update public.characters set role = '…' where name = '…';`). Waarde op het dashboard, rol ontbreekt of wijkt af → Discord gelijkzetten.
   - Iedereen heeft **Mannen**, behalve Lurkers; alts krijgen geen rollen.
   - Status = **Gestopt** → race/class/role/beroep-rollen weghalen (Mannen blijft). **Altijd eerst tonen welke rollen eraf gaan en op akkoord wachten.**
   - Speler op het dashboard maar niet in Discord → alleen melden.
4. **Eerst kort laten zien** wat er wordt aangepast en welke vragen er zijn, dan uitvoeren.
5. **Uitvoeren**, tabbladen sluiten en samenvatten: wat er in Discord en Supabase is aangepast, conflicten, wie nog niet gekoppeld is.

---

## Dashboard aanpassen
- **Alle tekst op de site is Engels** (labels, uitleg, placeholders, ook de addon-teksten in Supabase). Alleen deze instructies en de README zijn Nederlands. Nieuwe teksten dus in het Engels; toon een waarde die Nederlands is (zoals "Gestopt") via `statusLabel()` in `js/players.js`.

- **Vraag eerst of de guildbank al gekocht is** (zolang dat nog niet zo is).
- Lees eerst **README.md** en **CLAUDE.md** in de repo (technische regels: gewone HTML/CSS/JS, Engels op de site, `?v=__V__`, `confirm()` vóór verwijderen, `esc()`, `mine(user, uid)` voor "is dit van mij", enz.).
- Werk op een **eigen branch** (`jelle/…` of `tinus/…`), open een **pull request** en merge die. **Altijd eerst de laatste `main` ophalen.** Even in Discord melden waar je mee bezig bent.
- **Database**: wijziging in `supabase/schema.sql` (altijd `if not exists` / `drop policy if exists`) **én** uitvoeren in de SQL Editor, vóór de merge. RLS: persoonlijk via `same_player(user_id)`, gedeeld via `is_member()`.
- **Publiceren** gaat automatisch bij elke merge (GitHub Actions). Even controleren op de live site.
- **Nieuwe-versiebalk**: GitHub Pages houdt pagina's ±10 minuten in de browsercache. De deploy schrijft daarom `version.json` (`{"version":"<commitid>"}`, ook voor `/preview/`); `watchVersion()` in `js/layout.js` haalt dat bestand zonder cache op (bij het laden, elke 5 minuten en als je terugkomt op het tabblad) en vergelijkt het met de eigen versie (`__V__`). Verschilt het, dan staat bovenaan een balk "A new version of the site is available. Reload". Lokaal (niet gedeployd) doet hij niets.
- **Item- en questlijst** (`data/items.json`: **elk uur**, `data/quests.json`: **dagelijks**) automatisch bijgewerkt; niet met de hand aanpassen. `items.json` bevat per item ook de stapelgrootte (`stack`, 1 = niet stapelbaar); de Trade Market gebruikt die voor het aantal. Naast de volledige lijst bouwt de workflow `data/tradeable-items.json`: alleen items die verhandelbaar zijn (Bonding 0, 2 of 3 in de game-data: geen soulbound- en geen quest-items). De zoekfunctie van de Trade Market gebruikt die lijst en een listing kan alleen met een item uit die lijst geplaatst worden, dus niet met losse tekst (bij een ontbrekend bestand valt hij terug op de volledige lijst); `items.json` blijft de volledige itemlijst en wordt daarvoor niet aangepast. Staat `stack` er nog niet in, dan bouwt de workflow de lijst opnieuw op bij de eerstvolgende run (of start hem met de hand: Actions → Update items → Run workflow). Namen die leden typen en nog niet in een lijst staan, worden voor iedereen voorgesteld.
- **Dungeons/raids** (`js/dungeons.js`) en **WoW: Forever-releases** (`js/releases.js`, met `LAUNCH`): met de hand bijwerken als Blizzard iets nieuws aankondigt.
- **Na elke update dit bestand (`docs/instructies.md`) bijwerken in dezelfde pull request.**

---

## Samenwerken: elkaars werk nooit overschrijven
Jelle en Justin werken elk met hun eigen Claude in dezelfde repo.

### Bij de start van elk gesprek (Claude doet dit vanzelf)
1. Vraag met wie je praat (Jelle of Justin) als dat niet duidelijk is.
2. `git fetch` en geef een **korte samenvatting van wat de ander heeft gedaan sinds de laatste PR van deze persoon**: gemergede PR's van de ander (branch `tinus/…` = Justin, `jelle/…` = Jelle) met titel en het stukje *Voor de ander*. Bijv. `gh pr list --state merged --limit 30 --json number,title,headRefName,mergedAt,body` en filteren op de branchnaam.
3. Noem ook de **open draft-PR's van de ander** (`[bezig] …`): daar is hij nu mee bezig; niet aan dezelfde bestanden werken zonder overleg.
4. Na 5 nov 2026: noem de punten onder *Na de launch (todo)*.

### Tijdens het werk: laten zien waar je mee bezig bent
- Zodra je ergens aan begint: branch maken, eerste commit pushen en meteen een **draft-PR** openen met titel `[bezig] <onderwerp>`. Zo ziet de ander live op GitHub (en via `gh pr list`) waar je mee bezig bent.
- Klaar: `[bezig]` uit de titel, PR "ready for review" zetten, rebasen en mergen.
- Elke PR-beschrijving bevat: **Wat** (wat er veranderd is), **Waarom**, en **Voor de ander** (waar de ander op moet letten: andere bestanden, database-wijziging, iets om te testen). Die beschrijvingen samen zijn het logboek.

### Preview en "akkoord = live"
- Grote wijzigingen (bijv. een nieuwe opmaak) krijgen het label **`preview`** op de pull request. De site zet die branch dan automatisch op **https://jdckoop-sudo.github.io/mannenkeuken/preview/** (`preview.yml` start `pages.yml` opnieuw; altijd de nieuwste open PR met het label). Let op: de preview gebruikt dezelfde database als de live site.
- **Akkoord geven** (alleen de ánder, niet wie de PR maakte): op GitHub *Review changes → Approve → Submit*, of een reactie op de PR met alleen **`akkoord`** (ook goed: `approve`, `lgtm`, `ship it`). De workflow `go-live.yml` merget dan, publiceert de site en zet een bevestiging onder de PR. Binnen ±1 minuut live.
- Op de developer-pagina (In progress) staat bij zo'n PR **Open preview** en **Approve = live**.
- Op de developer-pagina staat een open preview ook automatisch als taak bij de ánder onder **To do → For you** ("Check the preview", met een knop **Check**) en bij de maker onder **Waiting on …**. Daar is geen bericht voor nodig.

### Regels
1. **Begin altijd vanaf de nieuwste `main`**: `git fetch` en een nieuwe branch vanaf `origin/main` (nooit verder bouwen op een oude lokale kopie).
2. **Kijk eerst wat de ander doet**: `gh pr list` (open PR's) en `git log origin/main -10` (laatste wijzigingen). Heeft de ander een open PR of branch die dezelfde bestanden raakt: niet daarin werken, eerst overleggen of wachten.
3. **Jelle en Justin doen allebei alles** – er is geen eigen terrein. Werk je in iets wat de ander als laatste heeft aangepast (zie `git log` per bestand), houd zijn aanpak aan en schrijf in de PR-tekst wat je hebt veranderd.
4. **Nooit direct naar `main` pushen en nooit `main` force-pushen.** Force-pushen mag alleen op je eigen branch.
5. **Vlak voor het mergen opnieuw rebasen op `origin/main`.** Bij conflicten **beide wijzigingen behouden**: nooit een heel bestand "van jezelf" laten winnen. Na de rebase opnieuw controleren (syntax, live site).
6. **Merge geeft "Base branch was modified"** → opnieuw rebasen en mergen; nooit forceren.
7. **Kleine PR's, één onderwerp per PR**, met een duidelijke titel. Dan is een conflict klein en makkelijk op te lossen.
8. **Gegenereerde bestanden** (`data/items.json`, `data/tradeable-items.json`, `data/quests.json`) alleen via hun workflow, nooit met de hand.
9. **Dit bestand** (`docs/instructies.md`) bijwerken in dezelfde PR als de wijziging. Raakt je wijziging een afspraak van de ander, laat die dan staan en voeg toe in plaats van te vervangen.
10. **Even in Discord melden** waar je mee bezig bent, zeker bij grotere wijzigingen.

### Developer mode (alleen Jelle en Justin)
- **Aan/uit**: 5× snel klikken op je class-icoontje rechtsboven. Uit → aan: opent `dev.html` en developer mode staat aan in die browser (rood **DEV**-label rechtsboven; klik op het label om naar de pagina te gaan). Aan → uit: nog eens 5× klikken (met bevestiging), of de knop op de pagina.
- **To do for you**: meldingen van de een aan de ander (tabel `dev_messages`), bijv. "vervang je projectinstructies". Ze blijven staan tot de ontvanger op **Done** klikt. Op de pagina staat per melding **van wie → aan wie**, apart *For you*, *Waiting on <de ander>* en *Done* (door wie en wanneer). Alleen de ontvanger kan op Done klikken. Open meldingen geven een rood getal rechtsboven, alleen voor de ontvanger en alleen in developer mode. Claude mag zo'n melding aanmaken als iets dat de ander *zelf* moet doen (instellingen, geheimen, projectinstructies).
- **Changes**: alle gemergede PR's per dag (strook per dag, filter op dag/persoon/tekst) met *Wat / Waarom / Voor de ander*, plus de open `[bezig]`-PR's.
- **Tabbladen** in de volgorde Changes · Fixes · Ideas · Checks · Characters (Changes opent standaard).
- **Automatische controle na elke deploy** (workflow *Check site after deploy*, script `tools/check-site.mjs`): opent de belangrijkste pagina's (Home, Members, Overview, Professions, Achievements, Market, Events, Bank, Tips, My profile) in een echte Chrome en zoekt naar fouten: een pagina die niet opent, een JavaScript-fout, een script/stijl/afbeelding/databestand van ons dat niet laadt, een lege pagina of een die op "Loading…" blijft staan, en kapotte lijsten (`items.json`, `tradeable-items.json`, `quests.json`). Wowhead en Google Fonts negeert hij. Gaat er iets mis, dan wordt de run rood, komt er een **rode regel in Checks** ("Automatic check after every deploy") en **één kaartje in Fixes** (gemaakt door *Deploy check*, label *Automatic check*, wordt bijgewerkt zolang het kapot is en gesloten zodra het weer groen is en niemand het oppakte). Zelf starten: Actions → *Check site after deploy* → Run workflow; lokaal: `CHROME_PATH=<chrome.exe> node tools/check-site.mjs`. **Eenmalig instellen** (Jelle of Justin): een lang willekeurig geheim als Actions-secret `DEPLOY_CHECK_SECRET` in GitHub, en hetzelfde geheim als hash in Supabase met de SQL in het commentaar boven `report_deploy_check` in `supabase/schema.sql` (Claude typt het geheim nooit in en vraagt er nooit naar). Zonder geheim draait de controle wel en wordt de run rood bij fouten, maar komt er niets in Checks of Fixes.
- **Meldingen van alle spelers**: iedere ingelogde speler heeft in het accountmenu (klik op je naam rechtsboven) **Report a problem** en **Suggest a feature**. Dat is een klein formulier (titel + uitleg; bij een probleem gaat de pagina en de siteversie automatisch mee, geen apparaatgegevens). Het komt als kaartje op **Fixes** of **Ideas** (functie `submit_ticket()` in `supabase/schema.sql`: neemt de naam uit `members`, max. 10 per uur per speler; spelers kunnen de borden zelf niet lezen). Op het kaartje staat het label **From player** en "Reported by <naam>"; kolom `source` = `player` (via de knoppen, ook als een developer ze gebruikt) of `board` (op dev.html zelf toegevoegd).
- **Oranje getal naast DEV** (naast het rode to-do-getal): aantal nieuwe ideeën en fixes van iemand anders sinds je het tabblad **Ideas** of **Fixes** voor het laatst opende (tabel `dev_seen`, functies `dev_ticket_news()` en `dev_mark_tickets_seen()`). Het getal linkt naar het tabblad met nieuwe kaartjes, en verdwijnt zodra je dat tabblad opent. Op de tabbladen staat "N new" en op de kaartjes een **New**-label tot je de pagina verlaat. Je eigen kaartjes tellen niet mee, behalve die je zelf via Report a problem / Suggest a feature instuurt (`source` = `player`). De New-labels blijven staan tot je het tabblad verlaat of op die kaart klikt. Kaartjes kun je met de muis tussen de kolommen Open / In progress / Done slepen (met dezelfde bevestigingen als de knoppen; op een telefoon gebruik je de knoppen).
- **Ideas** en **Fixes** (tabbladen, tabel `dev_tickets` met `kind` = `idea` of `fix`): kaartjes in drie kolommen **Open → In progress → Done**. Iedereen (Jelle/Justin) kan een kaartje toevoegen (titel, gebied, details) en aanpassen. Met **I'll take this** zet je het op je naam ("hier werk ik aan"); daarna **Done** of **Let go** (terug naar Open). Staat het op de naam van de ander, dan kun je het met **Take over** overnemen (met bevestiging). Done-kaartjes kun je **Reopen**en. Elk kaartje heeft een **urgentie** (Urgent / High / Normal / Low, kolom `urgency` 4–1); in Open en In progress staat de hoogste bovenaan. Klik op het urgentielabel om het te veranderen (Urgent → High → Normal → Low → Urgent), of kies het bij Edit. **Reacties**: met **☺+** zet je een van tien emoji's (❤️ 👍 👎 🔥 😂 🤔 🎉 👀 🚀 ⭐) op een kaartje; je ziet wie welke gaf, en nog eens klikken haalt de jouwe weg (kolom `reactions`, alleen te wijzigen via `toggle_ticket_reaction()`, die je naam uit `members` haalt). **Comments**: onder elk kaartje staat **💬 Comment(s)**; daar zet je een reactie in tekst. Je ziet van wie (naam, gezet door de database) en wanneer (datum + tijd, Nederlandse tijd); alleen je eigen comment kun je verwijderen (tabel `dev_ticket_comments`, gaat mee weg als het kaartje verwijderd wordt). In de dichte balk staat hoeveel comments er zijn en van wie de laatste is. **History** (change log): in een opengeklapt kaartje staat **🕘 History**, nieuwste bovenaan, met per regel wie wat deed en wanneer (aangemaakt, opgepakt, overgenomen, losgelaten, klaar, heropend, urgentie, titel/gebied/details aangepast; bij details staat wat er stond en wat er nu staat, kolom `detail`). Onderaan elk bord staat **🕘 History of all fixes / ideas**: alle regels van alle kaartjes van dat bord door elkaar, nieuwste bovenaan, met wie, wat, het kaartje (klik om ernaartoe te gaan), de fase van het kaartje nu (*now: Open / In progress / Done*) en het tijdstip; standaard de laatste 30 (*Show all*). Een trigger op `dev_tickets` (`log_ticket_change()`) schrijft dit naar `dev_ticket_log`, ongeacht waar de wijziging vandaan komt (dev.html, `submit_ticket()`, SQL); reacties tellen niet mee. Alleen te lezen door `is_dev()`; gaat mee weg als het kaartje verwijderd wordt. **Overzicht**: kaartjes staan standaard **ingeklapt** (titel, gebied, urgentie en één regel met wie/wanneer, op wiens naam, 💬-aantal en reacties); klik op de titel om open te klappen, of *Open all cards*. Boven elk bord een **filter**: zoeken (ook in comments), urgentie (Urgent / High and up / Normal and up / Low only), gebied en *Show* (not picked up yet, on my name, added by me, on the other's name, with my reaction). De Done-kolom toont de laatste 5 (*Show all*). `dev.html#ideas` / `#fixes` opent het tabblad direct. Claude zet een idee dat later moet (of een bug die hij niet meteen oplost) als kaartje op het bord, en een fix schrijft hij op als: wat is er mis · waar (pagina, apparaat) · hoe zie je het · wat zou moeten gebeuren.
- **Checks**: status van de GitHub-workflows, de databronnen (characters, Supabase, item-/questlijst, Blizzard-data) en een **checklist**. De itemlijst wordt vergeleken met de nieuwste Forever-build op wago.tools en de questlijst met de laatste geslaagde run van *Update quests* (oranje na 2 dagen): de datum in die bestanden verandert alleen als de lijst verandert en zegt dus niet of hij achterloopt. Verder staat er een **checklist** (`dev_checks`: OK / Broken / Needs a look). Claude zet na een update wat nog getest moet worden op de checklist als *Needs a look*, en wat hij op de live site heeft gecontroleerd als *OK*.
- **Extra rechten** in developer mode: listings van alle spelers verwijderen op de Trade Market (database: `is_dev()`).

### Wie doet wat
**Allebei alles**: sync, Supabase, guildcode, dashboard, stijl én de Blizzard-koppeling. Iedereen kan alles lokaal testen, ook de Blizzard-scripts (met een eigen dev-client, zie *Vaste gegevens*). Afstemmen gaat via de `[bezig]`-draft-PR's en een berichtje in Discord, niet via vaste taken.

### Nu bezig
Kijk op GitHub naar de open draft-PR's met `[bezig]` in de titel (dat is altijd actueel). Bekend op 3 nov: Justin werkt aan "laatste Blizzard-update tonen op het platform".

---

## Praktische tips (Claude in Chrome)
- Discord-rollen: echte klik op het modzicht-icoon in de rij → echte klik op "+" onder Rollen → het vinkje (`role="menuitemcheckbox"`) kan via JavaScript. Controleer of het menu bij het juiste lid hoort.
- Rolvolgorde: slepen werkt alleen in de linker rollenlijst binnen "Rol bewerken".
- Supabase SQL Editor: `monaco.editor.getModels()[0].setValue(…)`, dan Ctrl+Enter (waarschuwing "destructive operations" komt door `drop … if exists`). Daarna weg navigeren geeft "Leave site?": open liever een nieuw tabblad.
- Supabase-data lezen kan met `fetch()` vanaf een tabblad met het dashboard open (publieke sleutel uit `js/config.js`).
- Wachtwoorden, de guildcode, geheime sleutels en Supabase-instellingen opslaan doet de gebruiker zelf.

## Na de launch (todo) – Claude: noem deze punten bij de eerste sync of update na 5 nov 2026
1. ~~Blizzard-koppeling aanzetten~~ **Geregeld via Supabase** (zie *Update characters: elke 15 minuten*). Blizzard ververst een character pas na uitloggen, dus vaker dan elke 15 minuten heeft geen zin. Een update-knop of Discord-`/update` is niet nodig.
2. **Recepten-hover bij spelers**: in de Edge Function `update-characters` (Jelle of Justin; afstemmen via een `[bezig]`-draft-PR) per beroep ook `known_recipes` uit de Blizzard-professions bewaren in `blizzard_characters`. Daarna op Professions, Roster, characterpagina en bij "Requests you can craft" een hover tonen met wat iemand echt kan maken (Wowhead-links).
3. ~~Welk is leidend bij verschil sheet ↔ Blizzard~~ **Besloten op 5 nov 2026**: de API is leidend waar hij iets weet, de tabel `characters` is de terugval (zie *API of tabel: wie is leidend*).
4. **Laatste login openbaar?** Beslissen: tonen, weglaten, of repo privé (de tabel `blizzard_characters` is voor iedereen leesbaar).
5. **Home-intro** ("[Short guild intro / message of the day]"): staat als idee op het Ideas-bord (developer mode). Eerder voorstel = tot de launch een aftelklok, daarna een door leden aanpasbare *Message of the day* + het eerstvolgende event met "Sign up". Nog niet gekozen.
6. ~~Last seen in de Roster controleren~~ **Vervallen op 5 nov 2026**: de kolom is uit de Roster gehaald, omdat de laatste login uit de API niet zegt of een speler echt online is. De laatste login staat nog wel bij Details op de characterpagina.
7. **Laatste update tonen** op het platform (Justin was ermee bezig op 3 nov): controleren dat het na de launch klopt.
8. Optioneel later: een Discord-bot, alleen als er meer bot-functies komen (bijv. melding bij level 60, events aankondigen).

## Openstaand
- Yvo (Skynal): race leeg (Skyborne kan geen Priest). Bij de volgende sync vragen: Troll, Undead of Blood Elf.
- Guildbank: nog niet gekocht (sparen voor 100 gold).
- Nieuwe Forever-dungeons (Wowhead-id's) toevoegen aan `js/dungeons.js` zodra bekend.
- Blizzard-API: WoW: Forever (sinds de launch, 5 nov 2026; Blizzard heeft het niet gedocumenteerd, gecontroleerd met onze eigen sleutels): geen realms maar rulesets (`dynamic-forever-eu`: `/data/wow/region/index` en `/data/wow/ruleset/index`), characters staan in `profile-forever-eu` en worden **realmloos** opgevraagd als `/profile/wow/character/<voornaam>-<achternaam>` (kleine letters, streepje ertussen, bijv. `murn-rogue`), game data in `static-forever-eu`. Het werkt met de gewone app-token (client credentials). Publieke profielen bestaan pas **vanaf level 10**: een 404 kan dus "nog onder level 10" betekenen. `/profile/user/wow` (alle eigen characters, ook onder level 10) vraagt wel een gebruikerstoken met scope `wow.profile`. Getest op 5 nov 2026 met `tools/blizzard-test.mjs`: Murn Rogue (level 16) en Pala Pim (level 10) komen terug met level, class, laatste login en beroepen; Bunte Bapsimus gaf 404 (level 6). De data wordt elke 15 minuten opgehaald door de Edge Function in Supabase (zie *Update characters: elke 15 minuten*).
- De oude Discord-app/-provider in Supabase wordt niet meer gebruikt; mag uit.
