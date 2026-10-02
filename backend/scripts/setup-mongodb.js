import '../config.js';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { updateLocalEnvironment } from '../lib/localEnvironment.js';

const directory = fileURLToPath(new URL('../../.local/mongodb/', import.meta.url));
const dataDirectory = path.join(directory, 'data');
const credentialsPath = path.join(directory, 'credentials.json');
const replicaSet = 'focms-rs';
const database = 'focms_sas_elections_2k25';
const action = process.argv[2] || 'setup';

async function portIsOpen(port) {
    return new Promise(resolve => {
        const socket = net.connect({ host: '127.0.0.1', port });
        const done = value => { socket.destroy(); resolve(value); };
        socket.once('connect', () => done(true));
        socket.once('error', () => done(false));
        socket.setTimeout(500, () => done(false));
    });
}

function uriFor(credentials, operator = false, direct = false) {
    const user = operator ? 'focms_local_operator' : 'focms_portal';
    const password = operator ? credentials.operatorPassword : credentials.appPassword;
    const db = operator ? 'admin' : database;
    const topology = direct ? 'directConnection=true' : `replicaSet=${replicaSet}`;
    return `mongodb://${user}:${encodeURIComponent(password)}@127.0.0.1:${credentials.port}/${db}?${topology}`;
}

function connect(uri, timeout = 1000) {
    return mongoose.createConnection(uri, { serverSelectionTimeoutMS: timeout }).asPromise();
}

async function waitForPrimary(connection) {
    for (let attempt = 0; attempt < 100; attempt++) {
        const hello = await connection.db.admin().command({ hello: 1 });
        if (hello.setName !== replicaSet) throw new Error('The local MongoDB replica set has an unexpected name.');
        if (hello.isWritablePrimary) return;
        await delay(250);
    }
    throw new Error('MongoDB primary election timed out.');
}

async function startDatabase(credentials) {
    let child;
    if (!await portIsOpen(credentials.port)) {
        const keyFile = path.join(directory, 'replica-key');
        try { await readFile(keyFile); } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            await writeFile(keyFile, randomBytes(756).toString('base64'), { mode: 0o600 });
        }
        const configPath = path.join(directory, 'mongod.json');
        await writeFile(configPath, JSON.stringify({ storage: { dbPath: dataDirectory },
            net: { bindIp: '127.0.0.1', port: credentials.port }, replication: { replSetName: replicaSet },
            security: { authorization: 'enabled', keyFile },
            systemLog: { destination: 'file', path: path.join(directory, 'mongod.log'), logAppend: true } }, null, 2));
        child = spawn(process.env.MONGOD_BINARY || 'mongod', ['--config', configPath],
            { detached: true, windowsHide: true, stdio: 'ignore' });
        let failure;
        child.once('error', error => { failure = error; });
        child.unref();
        for (let attempt = 0; attempt < 100 && !await portIsOpen(credentials.port); attempt++) {
            if (failure || child.exitCode !== null) throw new Error('MongoDB could not start. Install mongod or inspect .local/mongodb/mongod.log.');
            await delay(200);
        }
        if (!await portIsOpen(credentials.port)) throw new Error('MongoDB startup timed out; inspect .local/mongodb/mongod.log.');
    }
    let operator;
    try {
        operator = await connect(uriFor(credentials, true, true));
    } catch {
        if (!child) throw new Error('Port is occupied by an unrecognized or inaccessible MongoDB server. No server settings were changed.');
        const bootstrap = await connect(`mongodb://127.0.0.1:${credentials.port}/admin?directConnection=true`);
        try {
            const hello = await bootstrap.db.admin().command({ hello: 1 });
            if (!hello.setName) {
                await bootstrap.db.admin().command({ replSetInitiate: { _id: replicaSet,
                    members: [{ _id: 0, host: `127.0.0.1:${credentials.port}` }] } });
            }
            await waitForPrimary(bootstrap);
            await bootstrap.db.admin().command({ createUser: 'focms_local_operator',
                pwd: credentials.operatorPassword, roles: [{ role: 'root', db: 'admin' }] });
        } finally { await bootstrap.close(); }
        operator = await connect(uriFor(credentials, true, true), 5000);
    }
    try {
        const options = await operator.db.admin().command({ getCmdLineOpts: 1 });
        if (path.resolve(options.parsed.storage.dbPath).toLowerCase() !== path.resolve(dataDirectory).toLowerCase() ||
            options.parsed.replication.replSetName !== replicaSet || options.parsed.net.bindIp !== '127.0.0.1' ||
            options.parsed.security.authorization !== 'enabled') {
            throw new Error('Refusing to configure a MongoDB instance outside the managed FOCMS directory.');
        }
        await waitForPrimary(operator);
        const db = operator.getClient().db(database);
        const info = await db.command({ usersInfo: 'focms_portal' });
        if (!info.users.length) {
            await db.command({ createUser: 'focms_portal', pwd: credentials.appPassword,
                roles: [{ role: 'readWrite', db: database }] });
        }
    } finally { await operator.close(); }
}

async function run() {
    if (!['setup', 'status', 'stop'].includes(action)) throw new Error('Use setup, status, or stop.');
    await mkdir(dataDirectory, { recursive: true });
    let credentials;
    try { credentials = JSON.parse(await readFile(credentialsPath, 'utf8')); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (action !== 'setup') throw new Error('The local FOCMS database has not been configured yet.');
        const port = Number(process.env.FOCMS_MONGODB_PORT || 27018);
        if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local MongoDB port.');
        if (await portIsOpen(port) || (await readdir(dataDirectory)).length) {
            throw new Error('The port or database directory is occupied. Set FOCMS_MONGODB_PORT to a free port; existing data was not changed.');
        }
        credentials = { port, operatorPassword: randomBytes(32).toString('hex'), appPassword: randomBytes(32).toString('hex') };
        await writeFile(credentialsPath, JSON.stringify(credentials), { mode: 0o600 });
    }
    if (action === 'stop') {
        if (!await portIsOpen(credentials.port)) { console.log('Local FOCMS MongoDB is already stopped.'); return; }
        const connection = await connect(uriFor(credentials, true, true));
        try {
            await connection.db.admin().command({ shutdown: 1 });
        } catch (error) {
            if (error.name !== 'MongoNetworkError' && error.name !== 'MongoServerClosedError') throw error;
        } finally { await connection.close(); }
        console.log('Local FOCMS MongoDB stopped. Data and credentials are retained.');
        return;
    }
    if (action === 'setup') await startDatabase(credentials);
    const connection = await connect(uriFor(credentials), 5000);
    try {
        const hello = await connection.db.admin().command({ hello: 1 });
        await connection.db.listCollections({}, { nameOnly: true }).toArray();
        if (hello.setName !== replicaSet || !hello.isWritablePrimary) throw new Error('MongoDB is not ready for transactional election writes.');
    } finally { await connection.close(); }
    if (action === 'setup') {
        const values = { MONGODB_URI: uriFor(credentials) };
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) values.JWT_SECRET = randomBytes(32).toString('hex');
        if (!process.env.PORT) values.PORT = '5000';
        if (!process.env.ALLOWED_ORIGINS) values.ALLOWED_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173';
        await updateLocalEnvironment(values);
    }
    console.log(`FOCMS MongoDB ready at 127.0.0.1:${credentials.port}; database ${database}; replica set ${replicaSet}; authentication enabled.`);
}

run().catch(() => {
    console.error('Local MongoDB setup failed. Check mongod installation, .local/mongodb/mongod.log, and availability of the configured port.');
    process.exitCode = 1;
});
