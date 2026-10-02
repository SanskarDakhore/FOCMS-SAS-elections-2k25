import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startKeepAlive } from '../lib/keepAlive.js';

test('startKeepAlive returns null when URL is missing', () => {
    const service = startKeepAlive({ url: '' });
    assert.equal(service, null);
});

test('startKeepAlive returns null when AUTO_PING_ENABLED is false', () => {
    const original = process.env.AUTO_PING_ENABLED;
    process.env.AUTO_PING_ENABLED = 'false';
    try {
        const service = startKeepAlive({ url: 'https://example.com' });
        assert.equal(service, null);
    } finally {
        process.env.AUTO_PING_ENABLED = original;
    }
});

test('startKeepAlive schedules ping for normalized health URL', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    let pingedUrl = '';
    const mockFetch = async (url) => {
        pingedUrl = url;
        return { ok: true, status: 200 };
    };

    const logs = [];
    const mockLogger = {
        log: (msg) => logs.push(msg),
        warn: (msg) => logs.push(msg),
    };

    try {
        const service = startKeepAlive({
            url: 'https://my-backend.onrender.com/',
            intervalMinutes: 10,
            fetchImpl: mockFetch,
            logger: mockLogger,
        });

        assert.ok(service);
        assert.equal(service.healthUrl, 'https://my-backend.onrender.com/api/health');
        assert.equal(service.intervalMs, 10 * 60 * 1000);

        // Test immediate manual ping trigger
        await service.pingNow();
        assert.equal(pingedUrl, 'https://my-backend.onrender.com/api/health');
        assert.ok(logs.some(l => l.includes('Ping successful')));

        service.stop();
    } finally {
        process.env.NODE_ENV = originalNodeEnv;
    }
});
