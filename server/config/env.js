export function loadServerEnv() {
  return {
    port: Number(process.env.PORT || 3000),
    listenHost: process.env.LISTEN_HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    databasePath: process.env.DATABASE_PATH || '',
    sessionSecret: process.env.SESSION_SECRET || 'dev-change-me-in-production',
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 8),
    setupUiPassword: process.env.SETUP_UI_PASSWORD || 'change-me-installer',
    mqttPort: Number(process.env.MQTT_PORT || 1883),
    loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
    loginLockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES || 15),
    devDiagnostics: process.env.DEV_DIAGNOSTICS === '1' && process.env.NODE_ENV !== 'production',
  };
}

export const env = loadServerEnv();
