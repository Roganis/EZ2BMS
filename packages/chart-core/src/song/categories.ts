// The song wheel's categories, as EZ2PORT has them.
//
// `song.ini`'s Category is a 1-based bank on the category strip: the 47 the
// original game has (song.bin, labelled by system/SongSelect/Sortimage/
// category_NN) plus the port's own 48, CUSTOM. The port files a user song
// in exactly that one bank - not in ALL, not in a level or alphabet bank as
// well (ez2/usersongs.c add_to_group) - and anything outside 1..48 becomes
// 48 (usersongs.c:131-135). Labels are the port's text/strings.ini words.

export type CategoryKind = 'featured' | 'version' | 'level' | 'alphabet' | 'other' | 'custom';

export interface Category {
  /** The number song.ini carries (1..48). */
  id: number;
  label: string;
  kind: CategoryKind;
}

export const CUSTOM_CATEGORY = 48;
export const CATEGORY_COUNT = 48;

const LABELS: [string, CategoryKind][] = [
  ['HOT', 'featured'],
  ['NEW', 'featured'],
  ['ALL', 'featured'],
  ['1st', 'version'],
  ['S/E', 'version'],
  ['2nd', 'version'],
  ['3rd', 'version'],
  ['4th', 'version'],
  ['PLT', 'version'],
  ['6th', 'version'],
  ['7th', 'version'],
  ['1.5-2.0', 'version'],
  ['CV', 'version'],
  ['3s-BE', 'version'],
  ['AEIC', 'version'],
  ['EC', 'version'],
  ['EV', 'version'],
  ['NT', 'version'],
  ['TT', 'version'],
  ...Array.from({ length: 17 }, (_, i): [string, CategoryKind] => [`LV${i + 1}`, 'level']),
  ['LV18+', 'level'],
  ...['ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQR', 'STU', 'VWX', 'YZ+'].map(
    (l): [string, CategoryKind] => [l, 'alphabet'],
  ),
  ['OTH', 'other'],
  ['CUSTOM', 'custom'],
];

export const CATEGORIES: readonly Category[] = LABELS.map(([label, kind], i) => ({
  id: i + 1,
  label,
  kind,
}));

/** A category number song.ini can carry, or undefined for anything else (0, 49, 3.5, "7"). */
export function validCategory(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= CATEGORY_COUNT
    ? n
    : undefined;
}

/** What the port will file the song under: the category, or CUSTOM when it has none. */
export function effectiveCategory(n: unknown): number {
  return validCategory(n) ?? CUSTOM_CATEGORY;
}

export function categoryLabel(n: unknown): string {
  return CATEGORIES[effectiveCategory(n) - 1]!.label;
}

/**
 * Banks a mode's pager steps over (tools/ez2play/select.c, the page keys):
 * RubyMix jumps from LV12 straight to ABC, 5KeyMix from LV17 to ABC, so a
 * song filed there cannot be reached in that mode.
 */
export function unreachableIn(category: number): ('ruby' | '5k-only')[] {
  const out: ('ruby' | '5k-only')[] = [];
  if (category >= 32 && category <= 37) out.push('ruby');
  if (category === 37) out.push('5k-only');
  return out;
}
