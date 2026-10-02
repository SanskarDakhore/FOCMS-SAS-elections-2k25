/**
 * FOCMS Auto Health Check & Keep-Alive Service
 * Sends periodic HTTP requests to the backend's /api/health endpoint
 * on Render (or any cloud host) to prevent the container from sleeping
 * after periods of inactivity (Render free tier sleeps after 15 min).
 */

export function startKeepAlive({
    url = process.env.AUTO_PING_URL || process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL,
    intervalMinutes = Number(process.env.PING_INTERVAL_MINUTES) || 12,
    fetchImpl = fetch,
    logger = console,
} = {}) {
    if (process.env.AUTO_PING_ENABLED === 'false' || process.env.NODE_ENV === 'test') {
        return null;
    }

    if (!url) {
        logger.log('[KeepAlive] No RENDER_EXTERNAL_URL or AUTO_PING_URL found; auto-ping is dormant until URL is set.');
        return null;
    }

    const cleanBaseUrl = url.replace(/\/+$/, '');
    const healthUrl = cleanBaseUrl.endsWith('/api/health') ? cleanBaseUrl : `${cleanBaseUrl}/api/health`;
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

    logger.log(`[KeepAlive] Scheduled auto-ping for ${healthUrl} every ${intervalMinutes}m.`);

    async function ping() {
        const start = Date.now();
        try {
            const response = await fetchImpl(healthUrl, {
                signal: AbortSignal.timeout(15000),
                headers: { 'User-Agent': 'FOCMS-KeepAlive/1.0' },
            });
            const duration = Date.now() - start;
            if (response.ok) {
                logger.log(`[KeepAlive] Ping successful (HTTP ${response.status}) in ${duration}ms at ${new Date().toISOString()}`);
            } else {
                logger.warn(`[KeepAlive] Ping returned HTTP ${response.status} in ${duration}ms`);
            }
        } catch (error) {
            logger.warn(`[KeepAlive] Ping failed (${error.name || 'Error'}: ${error.message})`);
        }
    }

    // Initial ping after 30 seconds to verify external connectivity on startup
    const initialTimer = setTimeout(ping, 30000);
    initialTimer.unref?.();

    const intervalTimer = setInterval(ping, intervalMs);
    intervalTimer.unref?.();

    return {
        healthUrl,
        intervalMs,
        stop() {
            clearTimeout(initialTimer);
            clearInterval(intervalTimer);
        },
        pingNow: ping,
    };
}
