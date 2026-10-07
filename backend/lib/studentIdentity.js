import { randomInt } from 'node:crypto';

const VOTER_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function normalizeStudentName(name) {
    return String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function generateVoterId() {
    return Array.from({ length: 6 }, () =>
        VOTER_ID_ALPHABET[randomInt(VOTER_ID_ALPHABET.length)]
    ).join('');
}
