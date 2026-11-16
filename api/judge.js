// AI judge for every typed answer, powered by Groq.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', fallback: true });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY is not set in Vercel', fallback: true });

  const { question, answer } = req.body || {};
  if (!question || !answer) return res.status(400).json({ error: 'Missing question or answer', fallback: true });

  const system = `You are the judge in an open-ended trivia game. Players type any answer they can think of, so the answer list is NOT limited. Decide whether the player's answer is a correct answer to the question using your own knowledge.

Rules:
1. Accept any answer that truly satisfies the question, even if it is not a famous or common example. Example: for "Name a country in Africa", "Democratic Republic of the Congo" is valid.
2. Accept common alternate names, abbreviations, and spellings (USA, DRC, Congo, etc.).
3. Accept small typos when the intended answer is clear. Put the correctly spelled answer in "corrected".
4. Reject answers that do not satisfy the question, are gibberish, or are not real things. Set "valid" to false.
5. Quality score, only when valid: how obscure or niche the answer is. 1-25 = very common and obvious, 26-50 = well known, 51-75 = moderately niche, 76-90 = niche, 91-100 = expert-level and rare.

Respond with JSON only: {"valid": true or false, "corrected": "correctly spelled answer or the same answer", "score": number 1-100 (use 1 if invalid)}`;

  const user = `QUESTION: ${question}\nPLAYER'S ANSWER: "${answer}"`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 300
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error?.message || `Groq returned HTTP ${response.status}`;
      console.error('Groq error:', msg);
      return res.status(502).json({ error: msg, fallback: true });
    }

    const text = data.choices?.[0]?.message?.content || '';
    let result;
    try { result = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(502).json({ error: 'Unreadable AI response', fallback: true });
      result = JSON.parse(m[0]);
    }

    const valid = result.valid === true;
    const score = valid ? Math.max(1, Math.min(100, Math.round(Number(result.score) || 50))) : 0;
    return res.status(200).json({
      valid,
      corrected: typeof result.corrected === 'string' ? result.corrected : answer,
      score
    });
  } catch (e) {
    console.error('Judge error:', e);
    return res.status(500).json({ error: e.message, fallback: true });
  }
}
