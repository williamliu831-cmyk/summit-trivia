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
5. Quality score, only when valid. Be very generous: every correct answer scores at least 60. 60-74 = common and obvious, 75-87 = solid or somewhat niche, 88-95 = niche, 96-100 = rare and expert-level.

Respond with JSON only: {"valid": true or false, "corrected": "correctly spelled answer or the same answer", "score": number 1-100 (use 1 if invalid)}`;

  const user = `QUESTION: ${question}\nPLAYER'S ANSWER: "${answer}"`;

  try {
    const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b'];
    let data = null, lastErr = 'no model answered';
    for (const model of MODELS) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 300
        })
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) { data = body; break; }
      lastErr = `${model}: ${body?.error?.message || 'HTTP ' + response.status}`;
      console.error('Groq error:', lastErr);
      if (response.status !== 404 && response.status !== 400) break; // only try the next model for model-name errors
    }
    if (!data) return res.status(502).json({ error: lastErr, fallback: true });

    const text = data.choices?.[0]?.message?.content || '';
    let result;
    try { result = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(502).json({ error: 'Unreadable AI response', fallback: true });
      result = JSON.parse(m[0]);
    }

    const valid = result.valid === true;
    const score = valid ? Math.max(60, Math.min(100, Math.round(Number(result.score) || 65))) : 0;
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
