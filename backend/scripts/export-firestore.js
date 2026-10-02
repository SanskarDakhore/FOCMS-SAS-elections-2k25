import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportFirestoreData } from '../lib/exportFirestore.js';

const run = promisify(execFile);
const projectId = 'focms-sas-elections-2k25';

async function getAccessToken() {
    const command = process.platform === 'win32' ? 'powershell.exe' : 'gcloud';
    const args = process.platform === 'win32'
        ? ['-NoProfile', '-NonInteractive', '-Command', 'gcloud auth print-access-token --quiet']
        : ['auth', 'print-access-token', '--quiet'];
    try {
        return (await run(command, args, { windowsHide: true, timeout: 30000 })).stdout.trim();
    } catch {
        throw new Error('Sign into gcloud with read access to the FOCMS Firebase project before exporting.');
    }
}

async function main() {
    const outputPath = process.argv[2];
    if (!outputPath) throw new Error('Provide an output path outside the repository for the private export.');
    const destination = path.resolve(outputPath);
    const repository = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
    const relativePath = path.relative(repository, destination);
    if (!relativePath || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath))) {
        throw new Error('The Firestore export contains sensitive data and must be saved outside the repository.');
    }
    const data = await exportFirestoreData({ projectId, accessToken: await getAccessToken() });
    await writeFile(destination, JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 });
    console.log('Private Firestore export saved:', Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length])));
}

main().catch(error => {
    console.error('Firestore export failed:', error.message);
    process.exitCode = 1;
});