// WoW: Forever quest list (data/quests.json, rebuilt daily by the "Update quests" GitHub workflow
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

// Quest names the guild typed in events that are not in the list yet (new in Forever): suggested too, as plain text.
let suggestPromise = null;
export function loadQuestSuggestions() {
  suggestPromise ??= Promise.all([loadQuests(), import('./supabase.js?v=__V__').then(async ({ supabase }) => {
    if (!supabase) return [];
    const { data } = await supabase.from('events').select('quest').is('quest_id', null).not('quest', 'is', null).limit(1000);
    return (data ?? []).map((r) => r.quest);
  }).catch(() => []), import('./itemsearch.js?v=__V__')]).then(([quests, typed, { withTyped }]) => withTyped(quests, typed));
  return suggestPromise;
}
