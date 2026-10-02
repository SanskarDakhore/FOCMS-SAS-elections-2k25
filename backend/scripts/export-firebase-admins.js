import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { firebaseProjectId, prepareFirebaseAdmins } from '../lib/importFirebaseAdmins.js';

const run = promisify(execFile);
const destination = fileURLToPath(new URL('../../.local/firebase-admin-snapshot.json', import.meta.url));

async function exportAdmins() {
    let token;
    try {
        const command = process.platform === 'win32' ? 'powershell.exe' : 'gcloud';
        const args = process.platform === 'win32'
            ? ['-NoProfile', '-NonInteractive', '-Command', 'gcloud auth print-access-token --quiet']
            : ['auth', 'print-access-token', '--quiet'];
        token = (await run(command, args, { windowsHide: true, timeout: 30000 })).stdout.trim();
    } catch {
        throw new Error('Sign into gcloud with access to the FOCMS Firebase project before exporting.');
    }
    const headers = { Authorization: `Bearer ${token}`, 'x-goog-user-project': firebaseProjectId };
    async function getJson(url) {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`Firebase export returned HTTP ${response.status}; check project and password-hash permissions.`);
        return response.json();
    }
    const admins = [];
    let pageToken;
    do {
        const url = new URL(`https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/admins`);
        url.searchParams.set('pageSize', '100');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const page = await getJson(url);
        admins.push(...(page.documents || []));
        pageToken = page.nextPageToken;
    } while (pageToken);
    const uids = new Set(admins.map(document => document.name.split('/').at(-1)));
    const emails = new Set(admins.map(document => document.fields.email?.stringValue?.toLowerCase()));
    const authUsers = [];
    pageToken = undefined;
    do {
        const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${firebaseProjectId}/accounts:batchGet`);
        url.searchParams.set('maxResults', '1000');
        if (pageToken) url.searchParams.set('nextPageToken', pageToken);
        const page = await getJson(url);
        authUsers.push(...(page.users || []).filter(user => uids.has(user.localId) || emails.has(user.email?.toLowerCase())));
        pageToken = page.nextPageToken;
    } while (pageToken);
    const config = await getJson(`https://identitytoolkit.googleapis.com/admin/v2/projects/${firebaseProjectId}/config`);
    const snapshot = { projectId: firebaseProjectId, exportedAt: new Date().toISOString(), admins, authUsers,
        hashConfig: config.signIn?.hashConfig };
    const prepared = prepareFirebaseAdmins(snapshot);
    await mkdir(new URL('../../.local/', import.meta.url), { recursive: true });
    await writeFile(destination, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    console.log(`Private snapshot saved: ${prepared.profiles.length} profiles, ${prepared.accounts.length} administrator accounts.`);
}

exportAdmins().catch(() => {
    console.error('Firebase administrator export failed. Check gcloud login, project access, and password-hash export permission.');
    process.exitCode = 1;
});
