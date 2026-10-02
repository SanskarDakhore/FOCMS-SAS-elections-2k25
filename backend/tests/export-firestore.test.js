import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFirestoreDocument, decodeFirestoreValue, exportFirestoreData } from '../lib/exportFirestore.js';

test('Firestore values decode recursively and preserve timestamps and large integers', () => {
    assert.deepEqual(decodeFirestoreValue({ mapValue: { fields: {
        count: { integerValue: '12' }, precise: { integerValue: '9007199254740993' },
        active: { booleanValue: true }, createdAt: { timestampValue: '2025-09-21T09:00:00Z' },
        items: { arrayValue: { values: [{ stringValue: 'one' }, { nullValue: null }] } },
    } } }), {
        count: 12, precise: '9007199254740993', active: true,
        createdAt: '2025-09-21T09:00:00Z', items: ['one', null],
    });
    assert.deepEqual(decodeFirestoreDocument({ name: 'projects/p/databases/(default)/documents/users/S101',
        fields: { id: { stringValue: 'not-the-document-id' }, name: { stringValue: 'Student' } } }),
    { id: 'S101', name: 'Student' });
});

test('Firestore export reads all supported collections across pages', async () => {
    const requests = [];
    const data = await exportFirestoreData({ projectId: 'test-project', accessToken: 'test-token', fetchImpl: async url => {
        requests.push(new URL(url));
        if (url.pathname.endsWith('/users') && url.searchParams.get('pageToken') === 'next') {
            return { ok: true, json: async () => ({ documents: [{ name: 'projects/p/databases/(default)/documents/users/S102',
                fields: { studentId: { stringValue: 'S102' } } }] }) };
        }
        if (url.pathname.endsWith('/users')) return { ok: true, json: async () => ({
            documents: [{ name: 'projects/p/databases/(default)/documents/users/S101', fields: {} }], nextPageToken: 'next',
        }) };
        return { ok: true, json: async () => ({}) };
    } });
    assert.deepEqual(data.users, [{ id: 'S101' }, { studentId: 'S102', id: 'S102' }]);
    assert.deepEqual(Object.keys(data), ['users', 'positions', 'candidates', 'votes', 'settings']);
    assert.equal(requests.length, 6);
    assert.ok(requests.every(url => url.searchParams.get('pageSize') === '100'));
});