import '../config.js';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { importFirebaseAdmins, prepareFirebaseAdmins } from '../lib/importFirebaseAdmins.js';
import { updateLocalEnvironment } from '../lib/localEnvironment.js';

try {
    const file = process.argv[2];
    if (!file) throw new Error('Supply the private firebase-admin-snapshot.json path.');
    if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI or run npm run mongodb:setup.');
    const snapshot = JSON.parse(await readFile(file, 'utf8'));
    prepareFirebaseAdmins(snapshot);
    // Write the matching server-only verifier parameters before adding any accounts.
    await updateLocalEnvironment({ FIREBASE_HASH_SIGNER_KEY: snapshot.hashConfig.signerKey,
        FIREBASE_HASH_SALT_SEPARATOR: snapshot.hashConfig.saltSeparator,
        FIREBASE_HASH_ROUNDS: snapshot.hashConfig.rounds, FIREBASE_HASH_MEMORY_COST: snapshot.hashConfig.memoryCost });
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const result = await importFirebaseAdmins(snapshot, mongoose.connection);
    console.log(JSON.stringify(result));
    console.log('Administrators sign in with their existing Firebase email and password.');
} catch (error) {
    console.error('Administrator migration failed:', error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
