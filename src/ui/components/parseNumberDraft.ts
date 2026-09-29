/** Parses the text of a number input; blank input is NaN (not 0), a decimal comma is accepted. */
export function parseNumberDraft(raw: string): number {
  const text = raw.trim().replace(',', '.');
  return text === '' ? Number.NaN : Number(text);
}
