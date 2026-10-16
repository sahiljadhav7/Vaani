// A `signal` payload per Events.md: exactly one of { description } (offer/answer) or { candidate } (ICE).
export function isSignal(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

  const hasDesc = Object.hasOwn(data, 'description');
  const hasCand = Object.hasOwn(data, 'candidate');
  if (hasDesc === hasCand) return false; // neither, or both

  if (hasDesc) {
    const d = data.description;
    return !!d && typeof d === 'object' && (d.type === 'offer' || d.type === 'answer') && typeof d.sdp === 'string';
  }
  const c = data.candidate;
  return !!c && typeof c === 'object' && typeof c.candidate === 'string';
}
