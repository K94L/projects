export default async function handler(req, res) {
  const token = process.env.TWELVE_DATA_KEY;
  if (!token) {
    return res.status(500).json({ error: 'Missing TWELVE_DATA_KEY' });
  }

  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent('USD/JPY')}&apikey=${token}`;
    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text();
      console.error('Twelve Data fetch error', r.status, text);
      if (r.status === 429) {
        return res.status(429).json({ error: 'Rate limited by provider' });
      }
      return res.status(502).json({ error: 'Upstream fetch failed' });
    }
    const json = await r.json();
    if (json && json.status === 'error') {
      console.error('Twelve Data error payload', json);
      return res.status(502).json({ error: json.message || 'Upstream error' });
    }

    const price = json && typeof json.price !== 'undefined' ? Number(json.price) : Number(json.close);
    const pct = json ? Number(json.percent_change ?? json.change_percentage ?? json.change) : null;

    const data = {
      asOf: new Date().toISOString(),
      dxy: { value: Number.isFinite(price) ? price : null, change1d: Number.isFinite(pct) ? pct : null },
    };

    res.setHeader('Cache-Control', 'no-store');
    return res.json(data);
  } catch (err) {
    console.error(err);
    if (err && err.status === 429) {
      return res.status(429).json({ error: 'Rate limited by provider' });
    }
    return res.status(500).json({ error: 'Fetch failed' });
  }
}
