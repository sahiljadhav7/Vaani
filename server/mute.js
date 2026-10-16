// A `mute` payload per Events.md: { muted: boolean }.
export function isMute(data) {
  return !!data && typeof data === 'object' && Object.hasOwn(data, 'muted') && typeof data.muted === 'boolean';
}
