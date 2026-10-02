import { createCipheriv, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);

export function decodeBase64(value, label, allowEmpty = false) {
    if (typeof value !== 'string' || (!value && !allowEmpty) ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
        throw new Error(`Invalid Firebase ${label}.`);
    }
    return Buffer.from(value, 'base64');
}

export function validateFirebaseHashConfig(config) {
    if (!config || config.algorithm !== 'SCRYPT') throw new Error('Firebase SCRYPT hash configuration is required.');
    const signerKey = decodeBase64(config.signerKey, 'signer key');
    decodeBase64(config.saltSeparator, 'salt separator', true);
    if (signerKey.length !== 64 || !Number.isInteger(config.rounds) || config.rounds < 1 || config.rounds > 16 ||
        !Number.isInteger(config.memoryCost) || config.memoryCost < 1 || config.memoryCost > 15) {
        throw new Error('Unsupported Firebase password hash parameters.');
    }
    return config;
}

export function configuredFirebaseHash() {
    return validateFirebaseHashConfig({ algorithm: 'SCRYPT',
        signerKey: process.env.FIREBASE_HASH_SIGNER_KEY,
        saltSeparator: process.env.FIREBASE_HASH_SALT_SEPARATOR,
        rounds: Number(process.env.FIREBASE_HASH_ROUNDS),
        memoryCost: Number(process.env.FIREBASE_HASH_MEMORY_COST) });
}

// Firebase's published algorithm and test vector: https://github.com/firebase/scrypt
export async function verifyFirebasePassword(password, hash, salt, config = configuredFirebaseHash()) {
    validateFirebaseHashConfig(config);
    const expected = decodeBase64(hash, 'password hash');
    if (expected.length !== 64) return false;
    const combinedSalt = Buffer.concat([decodeBase64(salt, 'password salt'),
        decodeBase64(config.saltSeparator, 'salt separator', true)]);
    const N = 2 ** config.memoryCost;
    const derived = await deriveKey(password, combinedSalt, 64,
        { N, r: config.rounds, p: 1, maxmem: Math.max(32 * 1024 * 1024, 256 * N * config.rounds) });
    try {
        const cipher = createCipheriv('aes-256-ctr', derived.subarray(0, 32), Buffer.alloc(16));
        const actual = Buffer.concat([cipher.update(decodeBase64(config.signerKey, 'signer key')), cipher.final()]);
        return timingSafeEqual(expected, actual);
    } finally {
        derived.fill(0);
    }
}
