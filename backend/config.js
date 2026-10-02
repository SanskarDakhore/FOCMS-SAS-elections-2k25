import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

export function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('Set JWT_SECRET to a random value of at least 32 characters in backend/.env.');
    }
    return secret;
}
