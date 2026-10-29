/** Public, fixed artwork catalog shared by server and browser. Never accept asset URLs from clients. */
const BOT_AVATAR_IDS = ['temu', 'bataa', 'sarnai', 'anu', 'bold', 'naraa', 'oyu'] as const;
export const AVATAR_IDS = [...BOT_AVATAR_IDS, 'sonio', 'tegshee', 'bulgaa', 'nyamaa', 'uugii', 'enguuj', 'khuslee', 'gerlee', 'doojii', 'amraa', 'anu-friend'] as const;
export type AvatarId = typeof AVATAR_IDS[number];
export const DEFAULT_AVATAR: AvatarId = 'temu';
export const AVATARS = AVATAR_IDS.map((id, index) => ({
  id, name: ['Тэмүү', 'Батаа', 'Сарнай', 'Ану', 'Болд', 'Нараа', 'Оюу', 'Сонио', 'Тэгшээ', 'Булгаа', 'Нямаа', 'Уугий', 'Энгүүж', 'Хүслээ', 'Гэрлээ', 'Доожий', 'Амраа', 'Ану'][index]!,
  image: `assets/characters/${id}.webp`,
}));
export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value);
}
export function normalizeAvatar(value: unknown): AvatarId {
  return isAvatarId(value) ? value : DEFAULT_AVATAR;
}
export function botAvatar(seat: number): AvatarId {
  return BOT_AVATAR_IDS[((seat - 1) % BOT_AVATAR_IDS.length + BOT_AVATAR_IDS.length) % BOT_AVATAR_IDS.length] ?? DEFAULT_AVATAR;
}
