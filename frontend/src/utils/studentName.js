export const normalizeStudentName = (name) =>
  String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
