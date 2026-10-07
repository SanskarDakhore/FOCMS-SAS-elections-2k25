import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachMongoCommandLogging } from '../lib/mongoCommandLogging.js';

test('MongoDB command logging records operation metadata without command data', () => {
    const client = new EventEmitter();
    const logs = [];
    const logger = {
        log: (...values) => logs.push(values.join(' ')),
        error: (...values) => logs.push(values.join(' ')),
    };
    attachMongoCommandLogging(client, logger);

    client.emit('commandStarted', {
        commandName: 'insert',
        databaseName: 'elections',
        command: { insert: 'users', documents: [{ studentId: 'private-id', password: 'private-password' }] },
        requestId: 4,
    });
    client.emit('commandSucceeded', { commandName: 'insert', duration: 8, requestId: 4 });
    client.emit('commandFailed', {
        commandName: 'update',
        duration: 2,
        failure: { name: 'MongoServerError', code: 11000, message: 'duplicate key private-id' },
        requestId: 5,
    });

    assert.equal(logs.length, 3);
    assert.match(logs[0], /"command":"insert"/);
    assert.match(logs[0], /"collection":"users"/);
    assert.match(logs[1], /"event":"command-succeeded"/);
    assert.match(logs[1], /"durationMs":8/);
    assert.match(logs[2], /"event":"command-failed"/);
    assert.match(logs[2], /"errorCode":11000/);
    assert.ok(logs.every(log => !log.includes('private-id') && !log.includes('private-password')));
});
