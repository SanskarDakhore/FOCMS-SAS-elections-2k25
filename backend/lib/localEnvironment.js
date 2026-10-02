import { readFile, writeFile } from 'node:fs/promises';

export const backendEnvPath = new URL('../.env', import.meta.url);

export async function updateLocalEnvironment(values) {
    let content = await readFile(backendEnvPath, 'utf8').catch(error => {
        if (error.code === 'ENOENT') return '';
        throw error;
    });
    for (const [key, value] of Object.entries(values)) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n]/.test(String(value))) throw new Error('Invalid environment setting.');
        const line = `${key}=${value}`;
        const expression = new RegExp(`^${key}=.*$`, 'm');
        content = expression.test(content) ? content.replace(expression, () => line) : `${content.trimEnd()}\n${line}\n`;
    }
    await writeFile(backendEnvPath, content, { mode: 0o600 });
}
