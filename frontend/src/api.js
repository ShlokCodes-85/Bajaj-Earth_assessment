const apiBase = import.meta.env.VITE_API_URL ?? '';

async function request(path, init) {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(body.detail ?? 'Request failed');
  }
  return response.json();
}

export function normalizeSnapshot(snapshot) {
  return {
    mode: snapshot.mode,
    sheetId: snapshot.sheet_id,
    sheetName: snapshot.sheet_name,
    updatedAt: snapshot.updated_at,
    rows: (snapshot.rows ?? []).map((row) => ({
      rowNumber: row.row_number,
      values: row.values,
    })),
  };
}

export async function getSheet(mode) { return normalizeSnapshot(await request(`/api/sheets?mode=${mode}`)); }
export async function updateRow(mode, rowNumber, values) { return normalizeSnapshot(await request(`/api/sheets/rows/${rowNumber}?mode=${mode}`, { method: 'PUT', body: JSON.stringify({ values }) })); }
export async function createRow(mode, values) { return normalizeSnapshot(await request(`/api/sheets/rows?mode=${mode}`, { method: 'POST', body: JSON.stringify({ values }) })); }
export async function deleteRow(mode, rowNumber) { return normalizeSnapshot(await request(`/api/sheets/rows/${rowNumber}?mode=${mode}`, { method: 'DELETE' })); }
export function getWebSocketUrl(mode) {
  if (import.meta.env.VITE_WS_URL) return `${import.meta.env.VITE_WS_URL}/ws/sync?mode=${mode}`;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/sync?mode=${mode}`;
}
export function startGoogleConnect() { window.location.href = `${apiBase}/api/auth/google/start`; }
export function getGoogleStatus() { return request('/api/auth/google/status'); }
export function getPickerToken() { return request('/api/auth/google/picker-token'); }
export async function selectGoogleSheet(spreadsheetId) { return normalizeSnapshot(await request('/api/auth/google/select', { method: 'POST', body: JSON.stringify({ spreadsheet_id: spreadsheetId }) })); }
export async function createGoogleSheet() { return normalizeSnapshot(await request('/api/auth/google/create', { method: 'POST' })); }

export async function openGooglePicker(onSelected) {
  const { access_token: accessToken } = await getPickerToken();
  const developerKey = import.meta.env.VITE_GOOGLE_API_KEY;
  if (!developerKey) throw new Error('VITE_GOOGLE_API_KEY is not configured.');

  await new Promise((resolve, reject) => {
    if (window.google?.picker) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => window.gapi.load('picker', resolve);
    script.onerror = () => reject(new Error('Unable to load Google Picker.'));
    document.head.appendChild(script);
  });

  const picker = new window.google.picker.PickerBuilder()
    .addView(new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS))
    .setOAuthToken(accessToken)
    .setDeveloperKey(developerKey)
    .setCallback((data) => {
      if (data.action === window.google.picker.Action.PICKED) onSelected(data.docs[0].id);
    })
    .build();
  picker.setVisible(true);
}
