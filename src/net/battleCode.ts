/** Codes de combat en ligne : 9 caractères, aussi en QR code `pocketpics://battle/<code>`. */
export const BATTLE_QR_PREFIX = 'pocketpics://battle/';

/** Code tapé ou scanné → code de salon (9 caractères), ou `null`. */
export function parseBattleCode(input: string): string | null {
  const raw = input.trim().startsWith(BATTLE_QR_PREFIX) ? input.trim().slice(BATTLE_QR_PREFIX.length) : input;
  const code = raw
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '');
  return code.length === 9 ? code : null;
}
