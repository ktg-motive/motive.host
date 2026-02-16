import { randomInt as cryptoRandomInt } from 'crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%^&*-_+=?';
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

function randomInt(max: number): number {
  return cryptoRandomInt(max);
}

export function generatePassword(length: number = 16): string {
  const required = [
    UPPER[randomInt(UPPER.length)],
    LOWER[randomInt(LOWER.length)],
    DIGITS[randomInt(DIGITS.length)],
    SPECIAL[randomInt(SPECIAL.length)],
  ];

  const remaining = Array.from({ length: length - required.length }, () =>
    ALL[randomInt(ALL.length)]
  );

  const chars = [...required, ...remaining];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
