const collections = ['users', 'positions', 'candidates', 'votes', 'settings'];

export function decodeFirestoreValue(value) {
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) {
        const number = Number(value.integerValue);
        return Number.isSafeInteger(number) ? number : value.integerValue;
    }
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value) return null;
    if ('timestampValue' in value) return value.timestampValue;
    if ('bytesValue' in value) return value.bytesValue;
    if ('referenceValue' in value) return value.referenceValue;
    if ('geoPointValue' in value) return value.geoPointValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
    if ('mapValue' in value) return decodeFirestoreFields(value.mapValue.fields || {});
    throw new Error('Unsupported Firestore value in export.');
}

function decodeFirestoreFields(fields) {
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

export function decodeFirestoreDocument(document) {
    const id = document.name?.split('/').at(-1);
    if (!id) throw new Error('Firestore document is missing its document ID.');
    return { ...decodeFirestoreFields(document.fields || {}), id };
}

export async function exportFirestoreData({ projectId, accessToken, fetchImpl = fetch }) {
    const data = {};
    for (const collection of collections) {
        const entries = [];
        let pageToken;
        do {
            const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
            const url = new URL(`${endpoint}/${collection}`);
            url.searchParams.set('pageSize', '100');
            if (pageToken) url.searchParams.set('pageToken', pageToken);
            const response = await fetchImpl(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(20000),
            });
            if (!response.ok) throw new Error(`Firestore export failed for ${collection} (HTTP ${response.status}).`);
            const page = await response.json();
            entries.push(...(page.documents || []).map(decodeFirestoreDocument));
            pageToken = page.nextPageToken;
        } while (pageToken);
        data[collection] = entries;
    }
    return data;
}