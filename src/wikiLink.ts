// Pure parser for the inside of a [[wiki link]] token. Shared by the editor's
// WikiLink node and the infobox WikiText renderer so the alias syntax
// (`Target|shown text`) is interpreted identically in both. The display text is
// cosmetic; `target` is the canonical page title everything else resolves by.

/** Split the inside of `[[…]]` into target + display. Splits on the first `|`
 *  only; trims both halves; returns null when the target is empty. With no (or
 *  empty) display, `display` equals `target`. */
export function parseWikiToken(raw: string): { target: string; display: string } | null {
  const pipe = raw.indexOf('|')
  const target = (pipe === -1 ? raw : raw.slice(0, pipe)).trim()
  if (!target) return null
  const display = pipe === -1 ? target : raw.slice(pipe + 1).trim() || target
  return { target, display }
}
