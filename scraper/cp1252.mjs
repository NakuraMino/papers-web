// Correct Windows-1252 decoding + text hygiene.
//
// Node's built-in TextDecoder('windows-1252') is effectively ISO-8859-1: it maps
// byte 0x92 -> U+0092 (a C1 control) instead of the real cp1252 U+2019 ('). So
// smart quotes / dashes / ellipses in the source render as boxes. We decode as
// latin1 (byte == codepoint, which Node does correctly) and then remap the
// 0x80-0x9F range ourselves using the official Windows-1252 table.

// Windows-1252 mapping for bytes 0x80..0x9F (index 0 == 0x80).
// '' = position is undefined in cp1252 (drop it).
const C1 = [
  '€', '', '‚', 'ƒ', '„', '…', '†', '‡',
  'ˆ', '‰', 'Š', '‹', 'Œ', '', 'Ž', '',
  '', '‘', '’', '“', '”', '•', '–', '—',
  '˜', '™', 'š', '›', 'œ', '', 'ž', 'Ÿ',
];

// Remap C1-range codepoints (0x80..0x9F) to their real cp1252 characters.
export function remapC1(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const cp = s.charCodeAt(i);
    out += cp >= 0x80 && cp <= 0x9f ? C1[cp - 0x80] : s[i];
  }
  return out;
}

// Strip C0 control chars + DEL, keeping tab (0x09) / newline (0x0a) / CR (0x0d).
// Removes copy-paste junk like the stray 0x02 some authors leave inside words.
export function stripControls(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const cp = s.charCodeAt(i);
    if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) continue;
    if (cp === 0x7f) continue;
    out += s[i];
  }
  return out;
}

// Decode a fetched page buffer per its declared charset.
export function decodeBuffer(buf, encoding) {
  if (!encoding || /^utf-?8$/i.test(encoding)) return new TextDecoder('utf-8').decode(buf);
  if (/^(windows-1252|cp1252|latin1|iso-8859-1)$/i.test(encoding)) {
    return remapC1(new TextDecoder('latin1').decode(buf));
  }
  return new TextDecoder(encoding).decode(buf);
}

// Repair an already-decoded string (used to fix data scraped before this module).
export const fixText = (s) => stripControls(remapC1(s || ''));
