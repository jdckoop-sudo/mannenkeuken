// The picture of a character from the game in our gold frame, and the items it wears around that picture (as on the Armory, but simpler).
// Used on My profile, the character page and the player page. The data comes from loadBlizzard() (fields media and equipment); the styles are in css/style.css.
import { esc } from './sheet.js?v=__V__';
import { classIcon } from './classicons.js?v=__V__';
import { wowheadUrl, qualityColor } from './itemsearch.js?v=__V__';

// The picture from the game: the full character if there is one, otherwise the smaller versions. Null when the game has none.
export const pictureOf = (entry) => {
  const media = entry?.status === 'ok' ? entry.media : null;
  const url = media?.main ?? media?.['main-raw'] ?? media?.inset ?? media?.avatar;
  return /^https:\/\//.test(url ?? '') ? url : null;
};

// The picture of the game is 1600 x 1200 with a small character in it. Find where the character stands (the part that is not transparent)
// and zoom in on it, as far as fits in the frame. When the picture cannot be read, the fixed crop in css/style.css stays.
const FRAME_RATIO = 176 / 246; // width / height of the inside of the narrowest frame
export function fitOf(box) {
  const height = box.bottom - box.top;
  const width = box.right - box.left;
  // The share of the picture's height that is shown: the whole character, with a little room around it.
  const shown = Math.min(1, Math.max(height, (width * 4) / 3 / FRAME_RATIO) * 1.06);
  const floor = Math.min(1, box.bottom + (shown - height) / 2);
  return { height: 100 / shown, bottom: -((1 - floor) * 100) / shown, center: ((box.left + box.right) / 2) * 100 };
}
function fitPicture(img) {
  const W = 400;
  const H = 300;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(img, 0, 0, W, H);
  let pixels;
  try { pixels = context.getImageData(0, 0, W, H).data; } catch { return; }
  const box = { left: W, right: 0, top: H, bottom: 0 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (pixels[(y * W + x) * 4 + 3] <= 20) continue;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x + 1);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y + 1);
    }
  }
  if (box.right <= box.left) return;
  const fit = fitOf({ left: box.left / W, right: box.right / W, top: box.top / H, bottom: box.bottom / H });
  img.style.height = `${fit.height}%`;
  img.style.bottom = `${fit.bottom}%`;
  img.style.transform = `translateX(-${fit.center}%)`;
}

// The frame with the picture; the class icon as long as the game has no picture. `entry` is the character in the game data, or nothing.
export function characterFrame(entry, name, cls) {
  const frame = document.createElement('div');
  frame.className = 'char-frame';
  const icon = () => { frame.innerHTML = classIcon(entry?.class || cls, 72); frame.classList.add('char-frame-empty'); };
  const url = pictureOf(entry);
  if (!url) { icon(); return frame; }
  const img = document.createElement('img');
  img.className = 'char-picture';
  img.alt = `${name} in the game`;
  img.loading = 'lazy';
  img.addEventListener('load', () => fitPicture(img));
  // First as a picture that may be read (the extra ?fit keeps it apart from a copy the browser already has that may not be read), then plain, then the icon.
  img.addEventListener('error', () => {
    if (img.crossOrigin === null) { icon(); return; }
    img.removeAttribute('crossorigin');
    img.src = url;
  });
  img.crossOrigin = 'anonymous';
  img.src = `${url}?fit`;
  const crop = document.createElement('div');
  crop.className = 'char-crop';
  crop.append(img);
  frame.append(crop);
  return frame;
}

// Where each item goes around the picture: left, right and below, as on the Armory. Keys are the slot types of the game.
const SLOTS_LEFT = [['HEAD', 'Head'], ['NECK', 'Neck'], ['SHOULDER', 'Shoulder'], ['BACK', 'Back'], ['CHEST', 'Chest'], ['SHIRT', 'Shirt'], ['TABARD', 'Tabard'], ['WRIST', 'Wrist']];
const SLOTS_RIGHT = [['HANDS', 'Hands'], ['WAIST', 'Belt'], ['LEGS', 'Legs'], ['FEET', 'Boots'], ['FINGER_1', 'Ring 1'], ['FINGER_2', 'Ring 2'], ['TRINKET_1', 'Trinket 1'], ['TRINKET_2', 'Trinket 2']];
const SLOTS_BELOW = [['MAIN_HAND', 'Main hand'], ['OFF_HAND', 'Off hand'], ['RANGED', 'Ranged']];
// A list of slots: the item name with a link to Wowhead, or the name of the slot in grey when it is empty.
function slotList(slots, gear, side) {
  return `<ul class="char-slots char-slots-${side}">${slots.map(([slot, label]) => {
    const g = gear.find((x) => x.slot === slot);
    return g ? `<li><a href="${wowheadUrl(encodeURIComponent(g.id))}" target="_blank" rel="noopener" style="color:${qualityColor(g.quality)}">${esc(g.name)}</a></li>` : `<li class="char-slot-empty">${esc(label)}</li>`;
  }).join('')}</ul>`;
}
// The picture with the items around it. The page calls refreshTooltips() from js/itemsearch.js after adding it.
export function characterDoll(entry, name, cls) {
  const gear = entry?.status === 'ok' ? entry.equipment ?? [] : [];
  const doll = document.createElement('div');
  doll.className = 'char-doll';
  doll.innerHTML = slotList(SLOTS_LEFT, gear, 'left') + slotList(SLOTS_RIGHT, gear, 'right') + slotList(SLOTS_BELOW, gear, 'below');
  doll.append(characterFrame(entry, name, cls));
  return doll;
}
