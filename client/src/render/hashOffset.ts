/** Deterministischer Zeit-Versatz (ms) aus einer ID, damit Figuren nicht synchron im Gleichschritt laufen. */
export function hashOffset(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 320;
}
