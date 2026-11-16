// Multiplayer game storage via Upstash Redis (command-array REST API)
async function kv(args) {
  const r = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || ('Upstash HTTP ' + r.status));
  return d.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const code = (req.method === 'GET' || req.method === 'DELETE') ? req.query.code : (req.body || {}).code;
  if (!code) return res.status(400).json({ error: 'Missing code' });
  const key = 'game:' + String(code).toUpperCase();

  try {
    if (req.method === 'GET') {
      const raw = await kv(['GET', key]);
      if (raw === null || raw === undefined) return res.status(404).json({ error: 'Game not found' });
      return res.status(200).json(JSON.parse(raw));
    }
    if (req.method === 'POST') {
      const { data } = req.body || {};
      if (!data) return res.status(400).json({ error: 'Missing data' });
      await kv(['SET', key, JSON.stringify(data), 'EX', '86400']); // keep 24 hours
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await kv(['DEL', key]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
