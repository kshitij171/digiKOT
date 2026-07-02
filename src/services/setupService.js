const TOKEN_KEY = 'setupToken';

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const setupService = {
  getToken,
  setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  },
  clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  },

  async login(password) {
    const res = await fetch('/api/setup/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await parseResponse(res);
    this.setToken(data.setupToken);
    return data;
  },

  async listDevices() {
    const res = await fetch('/api/setup/devices', { headers: authHeaders() });
    return parseResponse(res);
  },

  async saveRestaurantWifi({ ssid, password, mqttHost, mqttPort }) {
    const res = await fetch('/api/setup/restaurant-wifi', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ssid,
        password,
        mqtt_host: mqttHost,
        mqtt_port: mqttPort,
      }),
    });
    return parseResponse(res);
  },

  async pushAll() {
    const res = await fetch('/api/setup/push-all', {
      method: 'POST',
      headers: authHeaders(),
    });
    return parseResponse(res);
  },

  async pushOne(mac) {
    const res = await fetch(`/api/setup/push/${encodeURIComponent(mac)}`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return parseResponse(res);
  },

  async forgetWifi(mac) {
    const res = await fetch(`/api/setup/forget/${encodeURIComponent(mac)}`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return parseResponse(res);
  },

  async testBeep(mac) {
    const res = await fetch(`/api/setup/test/${encodeURIComponent(mac)}`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return parseResponse(res);
  },

  async patchDevice(mac, { deviceCode, label }) {
    const res = await fetch(`/api/setup/devices/${encodeURIComponent(mac)}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode, label }),
    });
    return parseResponse(res);
  },
};
