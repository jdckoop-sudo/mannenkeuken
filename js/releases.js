// WoW: Forever release schedule (Blizzard's 2026–2027 roadmap, announced at BlizzCon, Sept 2026).
// Blizzard has no public calendar feed, so this list is kept by hand: update it when Blizzard announces dates.
// `date` = exact moment (ISO, UTC) when known; otherwise `when` = rough period (shown as text, not in the week view).

export const releases = [
  { title: 'Early name reservation & character creation', date: '2026-10-27T00:00:00Z', allDay: true },
  { title: 'WoW: Forever launch', date: '2026-11-04T23:00:00Z', note: '3:00 p.m. PST on Nov 4 = midnight CET' },
  { title: 'Raids unlock: Barrow Deeps (10), Hyjal Summit (20), Onyxia\'s Lair (40)', date: '2026-12-09T00:00:00Z', allDay: true },
  { title: 'WoW: Forever Hardcore', when: 'Winter 2026', sort: '2026-12-31' },
  { title: 'Two new raids, two new dungeons, new quests & area, legendary questline, PvP season refresh', when: 'Spring 2027', sort: '2027-04-01' },
  { title: 'Revamped iconic raid, new raid, expanded world content', when: 'Summer 2027', sort: '2027-07-01' },
];

export const releaseSource = 'https://esports.gg/news/world-of-warcraft/wow-forever-roadmap-2026-and-2027/';

// Upcoming releases (dated ones not yet past, plus all undated ones), in order.
export function upcomingReleases(now = new Date()) {
  return releases
    .filter((r) => !r.date || new Date(r.date).getTime() > now.getTime() - 24 * 3600e3)
    .sort((a, b) => (a.date || a.sort).localeCompare(b.date || b.sort));
}

export function releaseWhen(r) {
  if (!r.date) return r.when;
  const d = new Date(r.date);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return r.allDay ? day : `${day} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
