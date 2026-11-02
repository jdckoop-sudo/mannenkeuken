// WoW: Forever quest list (data/quests.json, rebuilt weekly by the "Update quests" GitHub workflow
// from Questie for Forever). Used by the quest search on Raids & Events.
let questsPromise = null;
export function loadQuests() {
  questsPromise ??= fetch('data/quests.json?v=__V__')
    .then((r) => (r.ok ? r.json() : { quests: [] }))
    .then((d) => (d.quests ?? []).map(([id, name, level, minLevel, zone]) => ({ id, name, level, minLevel, zone, lower: name.toLowerCase() })))
    .catch(() => []);
  return questsPromise;
}
export const questUrl = (id) => `https://www.wowhead.com/forever/quest=${id}`;
