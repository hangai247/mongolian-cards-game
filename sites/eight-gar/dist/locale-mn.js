/** Mongolian presentation only. Engine values, protocol codes and saved data stay in English. */
export const SUIT_LABELS = Object.freeze({ hearts: 'Бундан', diamonds: 'Дөрвөлжин', spades: 'Гил', clubs: 'Цэцэг' });
export const JOKER_LABELS = Object.freeze({ gray: 'Саарал', black: 'Хар', red: 'Улаан' });
const RANK_LABELS = { J: 'боол', Q: 'хатан', K: 'ноён', A: 'тамга' };
const BOT_NAMES = ['Тэмүү', 'Батаа', 'Сарнай', 'Ану', 'Болд', 'Нараа', 'Оюу', 'Заяа'];

export function cardLabel(card) {
  return card.kind === 'joker' ? `${JOKER_LABELS[card.color]} жокер` : `${SUIT_LABELS[card.suit]} ${RANK_LABELS[card.rank] ?? card.rank}`;
}

export function seatName(info) {
  if (!info || info.kind === 'empty') return 'Сул суудал';
  // Human names, including disconnected players' reserved seats, are user content.
  if (info.kind === 'bot' && !info.reservedForName) return `${BOT_NAMES[info.seat] ?? 'Тоглогч'} (компьютер)`;
  return info.name ?? info.reservedForName ?? 'Тоглогч';
}

export const ERRORS = Object.freeze({
  INVALID_DECK: 'Хөзрийг тараах боломжгүй байна. Шинэ тоглолт эхлүүлнэ үү.',
  INVALID_PLAYER: 'Энэ суудал олдсонгүй.',
  INVALID_ACTION: 'Энэ үйлдлийг хийх боломжгүй байна.',
  INVALID_LEAD: 'Нэг хөзөр, хос дээр нэг хөзөр, эсвэл нөхцөл хангасан хоёр хостой таван хөзрөөр эхэлнэ.',
  THREE_CARD_LEAD_BLOCKED: 'Гурван хөзрөөр эхлэхэд найман тоглогч бүгд дор хаяж гурван хөзөртэй байх ёстой.',
  FIVE_CARD_LEAD_BLOCKED: 'Таван хөзрөөр эхлэхэд нөөц дууссан, бүх тоглогч дор хаяж таван хөзөртэй байх ёстой.',
  INVALID_RESPONSE: 'Ижил тооны хөзрөөр хөзөр бүрийг дарна. Жокерийг дангаар нь тавина.',
  INVALID_CARDS: 'Гартаа байгаа тохирох хөзрийг сонгоно уу.',
  WRONG_TURN: 'Өөрийн ээлжийг хүлээнэ үү.',
  ROUND_CLOSED: 'Энэ үе дууссан байна.',
  STALE_ACTION: 'Тоглоомын байдал өөрчлөгдлөө. Дахин шалгаад оролдоно уу.',
  NOTHING_TO_PICK_UP: 'Ширээн дээр авах хөзөр алга.',
  INVALID_NEXT_ROUND: 'Дараагийн үеийг одоохондоо эхлүүлэх боломжгүй.',
  LEADER_NOT_CHOSEN: 'Эхлэх тоглогчоо эхлээд сонгоно уу.',
  INVALID_LEADER: 'Эхлэх багаас тоглогч сонгоно уу.',
  REVIEW_IN_PROGRESS: 'Бусдад ширээний хөзрийг харах хугацаа өгнө үү.',
  NOT_YOUR_TEAM: 'Энэ үйлдлийг хийх эрхтэй багийн тоглогчийг хүлээнэ үү.',
  NOT_HOST: 'Зөвхөн ширээ нээсэн хүн энэ үйлдлийг хийнэ.',
  SEATS_NOT_FILLED: 'Эхлээд бүх суудлыг хүн эсвэл компьютер тоглогчоор дүүргэнэ үү.',
  SEAT_TAKEN: 'Энэ суудал эзэнтэй байна.',
  NOT_SEATED: 'Тоглохын тулд эхлээд суудалдаа орно уу.',
  ROOM_STARTED: 'Энэ ширээний тоглолт эхэлсэн байна.',
  ROOM_FULL: 'Энэ ширээ дүүрсэн байна.',
  ROOM_NOT_FOUND: 'Ийм кодтой ширээ олдсонгүй.',
  ROOM_CLOSED: 'Энэ ширээ хаагдсан байна.',
  NAME_TAKEN: 'Энэ ширээнд ийм нэртэй тоглогч байна.',
  RATE_LIMITED: 'Хэт олон удаа оролдлоо. Түр хүлээнэ үү.',
  INVALID_PAYLOAD: 'Оруулсан мэдээллээ шалгана уу. Нэр 1–20 тэмдэгт, ширээний код 6 латин үсэг эсвэл цифр байна.',
  UNAUTHORIZED: 'Ширээнд дахин нэвтэрнэ үү.',
  BAD_PHASE: 'Тоглоомын энэ үед уг үйлдлийг хийх боломжгүй.',
  VOICE_UNAVAILABLE: 'Энэ ширээнд дуут яриа боломжгүй байна.',
  NETWORK: 'Тоглоомд холбогдож чадсангүй. Интернэт холболтоо шалгана уу.',
  DISCONNECTED: 'Холболт тасарлаа. Дахин холбогдож байна…',
  CONNECT_ERROR: 'Холбогдож чадсангүй. Дахин оролдоно уу.',
  TIMEOUT: 'Тоглоомоос хугацаандаа хариу ирсэнгүй. Дахин оролдоно уу.',
  SERVER_ERROR: 'Тоглоомд алдаа гарлаа. Дахин оролдоно уу.',
});

// Never expose raw server, browser or engine diagnostics in the player interface.
export function errorText(error) {
  return Object.hasOwn(ERRORS, error?.code) ? ERRORS[error.code] : 'Алдаа гарлаа. Дахин оролдоно уу.';
}
