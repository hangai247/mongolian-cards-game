import { randomInt } from 'node:crypto';

/** 32 symbols without 0/O/1/I so codes survive being read aloud; six characters give 2^30 combinations. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export function generateCode(random: (max: number) => number = max => randomInt(max)): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  return code;
}

/** Uppercases, strips separators and maps the confusable glyphs the alphabet excludes. Does not validate. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}
