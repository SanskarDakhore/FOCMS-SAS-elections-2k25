import { randomBytes } from 'node:crypto';

export function normalizeStudentName(name) {
    return String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function generateVoterId() {
    return `VTR-${randomBytes(12).toString('hex').toUpperCase()}`;
}
