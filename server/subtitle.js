import { TEXT_MAX } from './call.js';

// A `subtitle` payload per Events.md: { text, final }. Empty interim text clears the Subtitle on the other side.
export function isSubtitle(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (!Object.hasOwn(data, 'text') || !Object.hasOwn(data, 'final')) return false;
  return typeof data.text === 'string' && data.text.length <= TEXT_MAX && typeof data.final === 'boolean';
}
