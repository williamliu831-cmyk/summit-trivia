export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { question, answer } = req.body || {};
  if (!question || !answer) return res.status(400).json({ error: 'Missing question or answer' });

  const prompt = `You are judging a trivia answer. Be flexible and fair.

Question: ${question}
Player's answer: "${answer}"

Judge whether this answer is correct or acceptable. Consider:
- Alternate spellings, abbreviations, partial names
- Synonyms and equivalent terms
- Minor typos (1-2 letters off)
- Colloquial or informal versions of correct answers

Respond ONLY with valid JSON in this exact format:
{"valid": true/false, "corrected": "canonical answer or empty string", "score": 1-100}

Score guide:
- 90-100: Perfect or very precise answer
- 70-89: Correct but could be more specific
- 50-69: Technically correct but vague or partial
- 20-49: Partially correct or close but missing key info
- 1-19: Very weak, barely acceptable
- 0: Wrong (set valid to false)

Only set valid:true if the answer is genuinely correct or acceptable.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 150 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini error:', err);
      return res.status(502).json({ error: 'AI service error', fallback: true });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(200).json({ valid: false, corrected: '', score: 0 });

    const result = JSON.parse(jsonMatch[0]);
    result.score = Math.max(0, Math.min(100, Math.round(result.score || 0)));
    if (!result.valid) result.score = 0;

    return res.status(200).json(result);
  } catch (e) {
    console.error('Judge error:', e);
    return res.status(500).json({ error: e.message, fallback: true });
  }
}
