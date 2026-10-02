import User from '../models/User.js';
import FirebaseAdminProfile from '../models/FirebaseAdminProfile.js';
import { decodeBase64, validateFirebaseHashConfig } from './firebaseCredentials.js';

export const firebaseProjectId = 'focms-sas-elections-2k25';

export function prepareFirebaseAdmins(snapshot) {
    if (snapshot.projectId !== firebaseProjectId || !Array.isArray(snapshot.admins) || !Array.isArray(snapshot.authUsers)) {
        throw new Error('A FOCMS Firebase administrator snapshot is required.');
    }
    validateFirebaseHashConfig(snapshot.hashConfig);
    const authByUid = new Map(snapshot.authUsers.map(user => [user.localId, user]));
    const accounts = new Map();
    const profiles = [];
    const emailOf = value => String(value || '').trim().toLowerCase();
    for (const document of snapshot.admins) {
        const prefix = `projects/${firebaseProjectId}/databases/(default)/documents/admins/`;
        if (!document.name?.startsWith(prefix)) throw new Error('Unexpected Firestore administrator document.');
        const uid = document.name.slice(prefix.length);
        const fields = document.fields || {};
        const email = emailOf(fields.email?.stringValue);
        const auth = authByUid.get(uid);
        // Email alone never grants admin access: a matching Firebase UID and admin profile are required.
        const matched = fields.role?.stringValue === 'admin' && auth && email && email === emailOf(auth.email);
        if (matched) {
            const hash = decodeBase64(auth.passwordHash, 'password hash');
            const salt = decodeBase64(auth.salt || auth.passwordSalt, 'password salt');
            if (hash.length !== 64 || !salt.length) throw new Error('Exported Firebase credentials are missing or redacted.');
            const createdAt = new Date(Number(auth.createdAt));
            if (!Number.isFinite(createdAt.getTime())) throw new Error('Invalid Firebase account creation date.');
            accounts.set(uid, { studentId: email, email, firebaseUid: uid,
                name: fields.name?.stringValue || auth.displayName || 'FOCMS Administrator',
                role: 'admin', disabled: auth.disabled === true, passwordAlgorithm: 'firebase-scrypt',
                password: auth.passwordHash, passwordSalt: auth.salt || auth.passwordSalt, createdAt });
        }
        profiles.push({ firestoreId: uid, firebaseUid: matched ? uid : undefined,
            email, name: fields.name?.stringValue, role: fields.role?.stringValue,
            createdAt: fields.createdAt?.timestampValue ? new Date(fields.createdAt.timestampValue) : undefined,
            status: matched ? (auth.disabled ? 'disabled' : 'active') : 'orphaned', sourceDocument: document });
    }
    const rows = [...accounts.values()];
    if (new Set(rows.map(user => user.email)).size !== rows.length) throw new Error('Duplicate Firebase admin login emails.');
    for (const profile of profiles) {
        if (profile.status === 'orphaned') {
            const canonical = rows.find(user => user.email === profile.email);
            if (canonical) { profile.status = 'alias'; profile.firebaseUid = canonical.firebaseUid; }
        }
    }
    return { accounts: rows, profiles };
}

export async function importFirebaseAdmins(snapshot, connection) {
    const { accounts, profiles } = prepareFirebaseAdmins(snapshot);
    const users = connection.models.User || connection.model('User', User.schema);
    const registry = connection.models.FirebaseAdminProfile || connection.model('FirebaseAdminProfile', FirebaseAdminProfile.schema);
    await Promise.all([users.init(), registry.init()]);
    let created = 0;
    await connection.transaction(async session => {
        created = 0;
        for (const account of accounts) {
            const existing = await users.findOne({ $or: [
                { studentId: account.studentId }, { firebaseUid: account.firebaseUid }, { email: account.email },
            ] }).session(session);
            if (existing) {
                if (existing.role !== 'admin' || existing.firebaseUid !== account.firebaseUid || existing.studentId !== account.studentId) {
                    throw new Error('Administrator migration conflicts with an existing account; no accounts were changed.');
                }
                // Re-running the migration preserves local passwords and account changes.
                continue;
            }
            await users.create([account], { session });
            created++;
        }
        for (const profile of profiles) {
            await registry.updateOne({ firestoreId: profile.firestoreId }, { $set: profile },
                { session, upsert: true, runValidators: true });
        }
    });
    return { adminProfiles: profiles.length, adminAccounts: accounts.length, created, retained: accounts.length - created,
        duplicateProfiles: profiles.filter(profile => profile.status === 'alias').length,
        orphanedProfiles: profiles.filter(profile => profile.status === 'orphaned').length,
        disabledAccounts: accounts.filter(account => account.disabled).length };
}
