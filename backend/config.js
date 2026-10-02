import dotenv from 'dotenv';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';

// Use reliable public DNS resolvers (Google & Cloudflare) to prevent querySrv EBADRESP errors on Windows/ISP networks
try {
    dns.setServers(['8.8.8.8', '1.1.1.1', ...dns.getServers()]);
} catch {
    // Keep system defaults if restricted
}

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

export function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('Set JWT_SECRET to a random value of at least 32 characters in backend/.env.');
    }
    return secret;
}
