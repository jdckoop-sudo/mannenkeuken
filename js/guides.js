// Guild guides, taken from the #macros and #game-settings channels on the Mannenkeuken Discord (31-10-2026).
// Edit here to update the site. Member tips added on the site live in Supabase (table "tips").

export const macroIntro = [
  'A macro is a home-made button for your action bar that runs one or more commands. Make them in-game with /macro (or Menu → Macros). Nothing to download, and Blizzard fully allows them.',
];

export const macroWhy = [
  'Several things on one button, e.g. a trinket + spell, or eat and drink at the same time',
  'Mouseover macros: heal, buff or dispel without switching target',
  'Fewer buttons and fewer misclicks',
  'Forever tip: a spell on your bar does not upgrade to the new rank when you learn it at the trainer. Put the spell name (without rank) in a macro and it always uses your highest rank.',
];

export const macroGood = [
  'A macro can be at most 255 characters',
  'One press = at most one spell on the global cooldown; a whole rotation on one button is not possible',
];

export const macros = [
  {
    title: 'Mouseover heal',
    by: 'Dirk-Christiaan',
    note: 'Heals whoever your mouse is on, otherwise your target, otherwise yourself. Swap Flash Heal for your own heal.',
    code: '#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Flash Heal',
  },
  {
    title: 'Mouseover healer abilities',
    by: 'MURN',
    note: 'Hover over a portrait and press your keybind to heal. Replace XABILITYX with the spell name.',
    code: '/cast [@mouseover,exists,help,nodead][@target,exists,help,nodead][@player] XABILITYX',
  },
  {
    title: 'Pet: attack (offensive)',
    by: 'MURN',
    note: 'For hunters and other pet enjoyers.',
    code: '/petdefensive\n/petattack',
  },
  {
    title: 'Pet: stop attack',
    by: 'MURN',
    note: 'Calls your pet back and stops it from attacking.',
    code: '/petpassive\n/petfollow',
  },
];

export const macroLinks = [
  ['Forever macros per class (RankedBoost)', 'https://rankedboost.com/world-of-warcraft/forever/macros/'],
  ['Forever macros, copy with one click (Kami Labs)', 'https://kami-labs.fr/en/macros-wow-forever/'],
  ['All macro commands explained (Warcraft Wiki)', 'https://warcraft.wiki.gg/wiki/Macro'],
  ['Macro guide for beginners (Wowhead)', 'https://www.wowhead.com/guide/macro-writing-creating'],
];

export const settingsIntro = 'Esc → Options. Everything is personal taste in the end, but this is a good starting point.';

export const settings = [
  ['Controls', [
    'Auto Loot on (hold Shift to loot manually)',
    'Enable Interact Key on → bind Interact With Target to e.g. F: talk to NPCs, loot and hand in quests with one key',
    'Max Camera Distance all the way to the right',
    'Camera Following on Never or Only When Moving, so the camera stops swinging back',
    'Sticky Targeting on, Click-to-Move off',
  ]],
  ['Interface & Combat', [
    'Status Text on Numeric or Both: by default you see no health/mana numbers',
    'Target of Target on: see who the mob is attacking (especially for tanks and healers)',
    'Self Cast on Auto + Alt as key, and Mouseover Cast on: heal or buff whoever your mouse is on',
    'Loss of Control Alerts on',
    'Combine Bags on: all your bags in one window',
    'Show lower-level quests on if you also want to see lower quests on the map',
  ]],
  ['Nameplates', [
    'Always Show Nameplates and enemy NPC nameplates on',
    'Aggro display on (tanks!) and cast bars with spell name',
    'Friendly player nameplates off – less clutter',
  ]],
  ['Advanced – built-in tools', [
    'Cooldown Manager, Damage Meter and (melee/wand) Swing Timer on: replaces a bunch of addons',
  ]],
  ['Keybinds & Social', [
    'Bind a key for Ping',
    'Use Quick Keybind Mode: hover an action button and press the key',
    'Whispers open in their own chat tab by default; turn that off under Social if you don\'t want it',
  ]],
  ['Graphics & FPS', [
    'Forever looks much better than Classic, but is also heavier. Start at Options → Graphics:',
    'Display Mode on Fullscreen (Windowed), your own screen resolution, Render Scale 100%',
    'Vertical Sync off (less input lag); with G-Sync/FreeSync follow what your monitor recommends',
    'Advanced → Graphics API on DirectX 12 and Multithreaded Rendering on',
    'Ray Traced Shadows off, Shadow Quality low or medium',
    'Lowering SSAO and Secondary Lighting saves a lot of FPS',
    'Lower View Distance if you get FPS drops in cities or raids',
    'Texture Resolution can stay high (costs video memory, hardly any FPS)',
    'Max Foreground FPS just below your monitor\'s Hz (e.g. 141 at 144 Hz), Max Background FPS on 30',
    'Target Framerate off: during the beta this gave many players a big FPS boost',
    'Raid and Battleground tab: make a lighter profile (shadows low, SSAO/Bloom off, View Distance lower)',
  ]],
  ['Sound', [
    'Music quieter (20–40%), effects at 100%, Error Speech off (no more "Not enough mana!")',
  ]],
  ['Still FPS problems?', [
    'Update your video drivers',
    'Close WoW, delete the Cache folder in your WoW Forever folder and start again',
    'Turn addons off for a moment to test whether they are the cause',
    'During the beta the game leaked memory: logging out to the character screen after a few hours of play helped',
  ]],
];
