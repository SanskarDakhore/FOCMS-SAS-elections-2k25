import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Position from '../models/Position.js';
import Candidate from '../models/Candidate.js';
import Vote from '../models/Vote.js';
import Setting from '../models/Settings.js';
import VotingBatch from '../models/VotingBatch.js';
import { importLegacyData } from '../lib/importLegacyData.js';

let mongo;
let dataDir;
let server;
let base;
let adminToken;
let studentToken;
let secondStudentToken;
let thirdStudentToken;
let excludedStudentToken;
let ballot;
let initialSchedule;

async function freePort() {
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    return port;
}

async function request(method, route, data, token) {
    const response = await fetch(base + route, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: response.status, body, headers: response.headers };
}

before(async () => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173,https://app.example.com,https://preview.example.com';
    const port = await freePort();
    dataDir = await mkdtemp(path.join(tmpdir(), 'focms-election-test-'));
    mongo = spawn(process.env.MONGOD_BINARY || 'mongod', ['--dbpath', dataDir, '--port', String(port),
        '--bind_ip', '127.0.0.1', '--replSet', 'focms-test-rs', '--quiet'], { stdio: 'ignore', windowsHide: true });
    let spawnError;
    mongo.on('error', error => { spawnError = error; });
    const uri = `mongodb://127.0.0.1:${port}/focms_integration_test`;
    let control;
    for (let attempt = 0; attempt < 60; attempt++) {
        if (spawnError) throw new Error('Install MongoDB or set MONGOD_BINARY to run integration tests: ' + spawnError.message);
        try {
            control = await mongoose.createConnection(uri + '?directConnection=true', { serverSelectionTimeoutMS: 500 }).asPromise();
            break;
        } catch { await delay(100); }
    }
    assert.ok(control, 'Temporary MongoDB started');
    await control.db.admin().command({ replSetInitiate: { _id: 'focms-test-rs',
        members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    await control.close();
    await mongoose.connect(uri + '?replicaSet=focms-test-rs', { serverSelectionTimeoutMS: 30000 });
    await Promise.all([User.init(), Vote.init(), Position.init(), Candidate.init(), Setting.init(), VotingBatch.init()]);
    process.env.JWT_SECRET = 'focms-integration-tests-use-an-isolated-secret';
    const { default: app } = await import('../app.js');
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
    const password = await bcrypt.hash('integration-password', 4);
    await User.create([
        { studentId: 'focms-test-admin', name: 'Test Admin', role: 'admin', password },
        { studentId: 'BBA101', name: 'Test Student', role: 'student', password, program: 'BBA', semester: '1', class: 'BBA-Sem1' },
        { studentId: 'BBA102', name: 'Second Student', role: 'student', password, program: 'BBA', semester: '1', class: 'BBA-Sem1' },
        { studentId: 'BBA103', name: 'Third Student', role: 'student', password, program: 'BBA', semester: '1', class: 'BBA-Sem1' },
        { studentId: 'BBA104', name: 'Unassigned Student', role: 'student', password, program: 'BBA', semester: '1', class: 'BBA-Sem1' },
    ]);
    const positions = await Position.create([{ name: 'President' }, { name: 'Secretary' }]);
    const candidates = await Candidate.create(positions.map(position => ({ name: position.name + ' Candidate',
        class: 'BBA-Sem1', positionId: position._id })));
    ballot = positions.map((position, index) => ({ positionId: String(position._id), candidateId: String(candidates[index]._id) }));
    initialSchedule = { votingStart: new Date(Date.now() - 60000).toISOString(),
        votingEnd: new Date(Date.now() + 3600000).toISOString(), isActive: true };
    await Setting.create({ key: 'votingSchedule', value: initialSchedule });
    adminToken = (await request('POST', '/auth/login', { studentId: 'focms-test-admin', password: 'integration-password' })).body.token;
    studentToken = (await request('POST', '/auth/login', { studentId: 'BBA101', password: 'integration-password' })).body.token;
    secondStudentToken = (await request('POST', '/auth/login', { studentId: 'BBA102', password: 'integration-password' })).body.token;
    thirdStudentToken = (await request('POST', '/auth/login', { studentId: 'BBA103', password: 'integration-password' })).body.token;
    excludedStudentToken = (await request('POST', '/auth/login', { studentId: 'BBA104', password: 'integration-password' })).body.token;
    assert.ok(adminToken);
    assert.ok(studentToken);
    assert.equal((await request('POST', '/votes/batch', {
        className: 'BBA-Sem1', studentIds: ['BBA101', 'BBA102', 'BBA103']
    }, adminToken)).status, 200);
}, { timeout: 60000 });

after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (mongo && mongo.exitCode === null && mongo.pid) {
        const stopped = new Promise(resolve => mongo.once('exit', resolve));
        mongo.kill();
        await stopped;
    }
    if (dataDir) {
        const resolved = path.resolve(dataDir);
        assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
        assert.ok(path.basename(resolved).startsWith('focms-election-test-'));
        await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
});

test('FOCMS health, protected results, no public seed admin, and invalid JWT rejection', async () => {
    assert.equal((await request('GET', '/health')).body.portal, 'FOCMS Election Portal');
    assert.equal((await request('GET', '/votes/results')).status, 401);
    assert.equal((await request('GET', '/votes/results', undefined, studentToken)).status, 403);
    assert.equal((await request('POST', '/auth/seed-admin', {})).status, 404);
    const forged = jwt.sign({ user: { id: 'BBA101', role: 'admin' } }, 'your-secret-key-change-this');
    assert.equal((await request('GET', '/users', undefined, forged)).status, 401);
    const staleRole = jwt.sign({ user: { id: 'BBA101', role: 'admin' } }, process.env.JWT_SECRET);
    assert.equal((await request('GET', '/users', undefined, staleRole)).status, 403);
});

test('CORS allows configured env origins and rejects unrelated domains', async () => {
    const allowedOrigins = ['https://app.example.com', 'https://preview.example.com'];

    for (const origin of allowedOrigins) {
        const preflight = await fetch(`${base}/settings/votingSchedule`, {
            method: 'OPTIONS',
            headers: {
                Origin: origin,
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'authorization'
            }
        });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    }

    const unrelated = await fetch(`${base}/settings/votingSchedule`, {
        method: 'OPTIONS',
        headers: {
            Origin: 'https://unrelated-app.example.com',
            'Access-Control-Request-Method': 'GET'
        }
    });
    assert.equal(unrelated.headers.get('access-control-allow-origin'), null);
});

test('FOCMS BBA/MBA fields survive student create and edit; hashes are never returned', async () => {
    const created = await request('POST', '/users', { studentId: 'MBA301', name: 'MBA Student',
        program: 'MBA', semester: '3', class: 'MBA-Sem3', password: 'student-password' }, adminToken);
    assert.equal(created.status, 200);
    assert.equal(created.body.program, 'MBA');
    assert.equal(created.body.semester, '3');
    assert.equal(created.body.password, undefined);
    const edited = await request('PUT', '/users/MBA301', { name: 'Updated MBA', program: 'MBA', semester: '1', class: 'MBA-Sem1' }, adminToken);
    assert.equal(edited.body.semester, '1');
    assert.equal((await request('POST', '/users', { studentId: 'bad-mba', name: 'Bad', program: 'MBA', semester: '5' }, adminToken)).status, 400);
    assert.equal((await request('DELETE', '/users/focms-test-admin', undefined, adminToken)).status, 404);
});

test('invalid, incomplete, duplicate and mismatched ballots write no votes', async () => {
    for (const invalid of [[], ballot.slice(0, 1), [ballot[0], ballot[0]],
        [ballot[0], { ...ballot[1], candidateId: ballot[0].candidateId }], {}]) {
        assert.equal((await request('POST', '/votes', invalid, studentToken)).status, 400);
    }
    assert.equal(await Vote.countDocuments(), 0);
    assert.equal((await User.findOne({ studentId: 'BBA101' })).hasVoted, false);
    assert.equal((await request('POST', '/votes', ballot, adminToken)).status, 403);
});

test('schedule closure, elapsed deadline and departmental limits are enforced by the API', async () => {
    for (const value of [{ ...initialSchedule, isActive: false },
        { ...initialSchedule, votingStart: '2020-01-01', votingEnd: '2020-01-02' }]) {
        await Setting.updateOne({ key: 'votingSchedule' }, { value });
        assert.equal((await request('POST', '/votes', ballot, studentToken)).status, 400);
    }
    await Setting.updateOne({ key: 'votingSchedule' }, { value: { ...initialSchedule,
        enableDepartmentalVoting: true, allowCrossDepartmentVoting: false } });
    await Candidate.updateOne({ _id: ballot[1].candidateId }, { class: 'MBA-Sem1' });
    assert.equal((await request('POST', '/votes', ballot, studentToken)).status, 400);
    await Candidate.updateOne({ _id: ballot[1].candidateId }, { class: 'BBA-Sem1' });
    await Setting.updateOne({ key: 'votingSchedule' }, { value: initialSchedule });
    assert.equal((await request('POST', '/settings', { key: 'votingSchedule', value: {
        ...initialSchedule, votingStart: 'invalid' } }, adminToken)).status, 400);
});

test('concurrent submissions record one complete ballot, admin results count it, then vote reset permits a new ballot', async () => {
    const submissions = await Promise.all([request('POST', '/votes', ballot, studentToken),
        request('POST', '/votes', ballot, studentToken)]);
    assert.deepEqual(submissions.map(response => response.status).sort(), [200, 400]);
    assert.equal(await Vote.countDocuments({ userId: 'BBA101' }), 2);
    const results = await request('GET', '/votes/results', undefined, adminToken);
    assert.equal(results.body.length, 2);
    assert.ok(results.body.every(result => result.totalVotes === 1));
    assert.equal((await request('POST', '/auth/login', { studentId: 'BBA101', password: 'integration-password' })).status, 403);
    assert.equal((await request('DELETE', '/users/BBA101/votes', undefined, adminToken)).status, 200);
    assert.equal(await Vote.countDocuments({ userId: 'BBA101' }), 0);
    assert.equal((await request('POST', '/votes', ballot, studentToken)).status, 200);
});

test('class batches enforce capacity and cooldown, then admit missed unvoted students', async () => {
    assert.equal((await request('POST', '/votes', ballot, excludedStudentToken)).status, 403);

    await VotingBatch.updateOne({ _id: 'current' }, { $set: { activeSubmissions: 100 } });
    const full = await request('POST', '/votes', ballot, thirdStudentToken);
    assert.equal(full.status, 429);
    assert.equal(full.headers.get('retry-after'), '1');
    await VotingBatch.updateOne({ _id: 'current' }, { $set: { activeSubmissions: 0 } });

    const closed = await request('POST', '/votes/batch/close', {}, adminToken);
    assert.equal(closed.status, 200);
    assert.ok(new Date(closed.body.cooldownUntil).getTime() > Date.now());
    assert.equal((await request('POST', '/votes/batch', {
        className: 'BBA-Sem1', studentIds: ['BBA102', 'BBA103']
    }, adminToken)).status, 429);

    await VotingBatch.updateOne({ _id: 'current' }, { $set: { cooldownUntil: new Date(Date.now() - 1) } });
    assert.equal((await request('POST', '/votes/batch', {
        className: 'BBA-Sem1', studentIds: ['BBA102', 'BBA103']
    }, adminToken)).status, 200);
    assert.equal((await request('GET', '/votes/batch/status', undefined, secondStudentToken)).body.allowed, true);
    assert.equal((await request('GET', '/votes/batch/status', undefined, excludedStudentToken)).body.allowed, false);

    const submissions = await Promise.all([
        request('POST', '/votes', ballot, secondStudentToken),
        request('POST', '/votes', ballot, thirdStudentToken)
    ]);
    assert.deepEqual(submissions.map(response => response.status), [200, 200]);
    const batch = await request('GET', '/votes/batch', undefined, adminToken);
    assert.equal(batch.body.status, 'cooldown');
    assert.equal(batch.body.remainingCount, 0);
});

test('bulk reset issues usable new credentials; bulk delete preserves admin accounts', async () => {
    const reset = await request('POST', '/users/bulk/reset-passwords', {}, adminToken);
    assert.equal(reset.status, 200);
    const student = reset.body.find(item => item.studentId === 'MBA301');
    assert.ok(student.password);
    assert.equal((await request('POST', '/auth/login', { studentId: student.studentId, password: student.password })).status, 200);
    assert.equal((await request('DELETE', '/users/bulk/all', undefined, adminToken)).status, 200);
    assert.equal(await User.countDocuments({ role: 'student' }), 0);
    assert.equal(await User.countDocuments({ role: 'admin' }), 1);
    assert.equal(await Vote.countDocuments(), 0);
});

test('offline Firebase import preserves FOCMS fields and votes, hashes passwords, and refuses occupied targets', async () => {
    const target = mongoose.connection.useDb('focms_migration_test');
    const legacy = {
        users: [{ id: 'BBA501', studentId: 'BBA501', name: 'Legacy Student', password: 'legacy-password',
            program: 'BBA', semester: 5, class: 'BBA-Sem5', hasVoted: true }],
        positions: [{ id: 'president', name: 'President' }],
        candidates: [{ id: 'candidate', name: 'Legacy Candidate', positionId: 'president', class: 'BBA-Sem5' }],
        votes: [{ id: 'vote', voterId: 'BBA501', positionId: 'president', candidateId: 'candidate',
            timestamp: { seconds: 1700000000 } }],
        settings: [{ id: 'electionConfig', isActive: false,
            votingStart: { seconds: 1700000000 }, votingEnd: { seconds: 1700003600 } }],
    };
    assert.deepEqual(await importLegacyData(legacy, target),
        { users: 1, positions: 1, candidates: 1, votes: 1, settings: 1 });
    const importedStudent = await target.models.User.findOne({ studentId: 'BBA501' });
    assert.equal(importedStudent.program, 'BBA');
    assert.equal(importedStudent.semester, '5');
    assert.equal(await bcrypt.compare('legacy-password', importedStudent.password), true);
    const candidate = await target.models.Candidate.findOne();
    const vote = await target.models.Vote.findOne();
    assert.equal(String(vote.candidateId), String(candidate._id));
    assert.equal(vote.timestamp.toISOString(), '2023-11-14T22:13:20.000Z');
    const schedule = await target.models.Setting.findOne({ key: 'votingSchedule' });
    assert.equal(schedule.value.votingStart, '2023-11-14T22:13:20.000Z');
    await assert.rejects(importLegacyData(legacy, target), /empty target database/);
    const invalidTarget = mongoose.connection.useDb('focms_invalid_migration_test');
    await assert.rejects(importLegacyData({ ...legacy, candidates: [
        { ...legacy.candidates[0], positionId: 'unknown' }] }, invalidTarget), /unknown position/);
    assert.equal(await invalidTarget.models.User.countDocuments(), 0);
});
