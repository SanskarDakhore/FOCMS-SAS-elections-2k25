import mongoose from 'mongoose';
import { getJwtSecret } from './config.js';
import app from './app.js';

import { startKeepAlive } from './lib/keepAlive.js';
import { attachMongoCommandLogging } from './lib/mongoCommandLogging.js';
import { migrateStudentIdentity } from './lib/migrateStudentIdentity.js';

try {
    getJwtSecret();
    if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in backend/.env.');
    await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        monitorCommands: true,
        autoIndex: false,
    });
    attachMongoCommandLogging(mongoose.connection.getClient());
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') {
        throw new Error('MongoDB must use a replica set or Atlas cluster for atomic vote submission.');
    }
    await migrateStudentIdentity();
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
        console.log(`FOCMS Election Portal API listening on port ${port}`);
        startKeepAlive();
    });
} catch (error) {
    console.error('FOCMS API startup failed:', error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
}
