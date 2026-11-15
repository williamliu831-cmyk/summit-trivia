// Multiplayer game storage via Upstash Redis REST API
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await r.json();
  if (data.result === null || data.result === undefined) return null;
  try { return JSON.parse(data.result); } catch { return data.result; }
}
async function kvSet(key, value, exSeconds) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const path = exSeconds ? `/set/${encodeURIComponent(key)}?EX=${exSeconds}` : `/set/${encodeURIComponent(key)}`;
  await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value))
  });
}
async function kvDel(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const code = (req.method === 'GET' || req.method === 'DELETE')
    ? req.query.code
    : (req.body || {}).code;

  if (!code) return res.status(400).json({ error: 'Missing code' });
  const key = 'game:' + code.toUpperCase();

  if (req.method === 'GET') {
    try {
      const data = await kvGet(key);
      if (!data) return res.status(404).json({ error: 'Game not found' });
      return res.status(200).json(data);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'POST') {
    const { data } = req.body || {};
    if (!data) return res.status(400).json({ error: 'Missing data' });
    try {
      await kvSet(key, data, 86400); // expire after 24 hours
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'DELETE') {
    try {
      await kvDel(key);
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
