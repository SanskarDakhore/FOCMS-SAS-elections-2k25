export const normalizeStudentName = (name) =>
  String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export const generateVoterId = (reservedIds = new Set()) => {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random generation is unavailable in this browser.');
  }
  let voterId;
  do {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    voterId = `VTR-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  } while (reservedIds.has(voterId));
  reservedIds.add(voterId);
  return voterId;
};
