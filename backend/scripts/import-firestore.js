import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import '../config.js';
import { importLegacyData } from '../lib/importLegacyData.js';

try {
    const inputPath = process.argv[2];
    if (!inputPath) throw new Error('Provide the path to a normalized Firestore JSON export. See MIGRATION.md.');
    const data = JSON.parse(await readFile(inputPath, 'utf8'));
    if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI to an empty FOCMS replica-set database.');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const counts = await importLegacyData(data, mongoose.connection);
    console.log('FOCMS legacy import complete:', counts);
} catch (error) {
    console.error('Import failed:', error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
