export default async function handler(req, res) {
  const token = process.env.FINNHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Missing FINNHUB_TOKEN' });
  }

  const symbols = {
    vix: '^VIX',
    brent: 'OANDA:BCO_USD',
    dxy: 'OANDA:DXY',
    hsi: '^HSI',
    nikkei: '^N225',
    asx: '^AXJO',
    dax: '^GDAXI',
    obx: 'OSE:OBX',
    ftse: '^FTSE',
    spx: '^GSPC',
    ndx: '^NDX',
    dow: '^DJI',
  };

  const fetchQuote = async (sym) => {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${token}`);
    if (!r.ok) throw new Error(`Quote failed for ${sym}`);
    return r.json();
  };

  try {
    const entries = await Promise.all(Object.entries(symbols).map(async ([k, sym]) => [k, await fetchQuote(sym)]));
    const m = Object.fromEntries(entries);
    const pick = (k) => (m[k] && typeof m[k].c === 'number' ? m[k].c : null);
    const pct = (k) => (m[k] && typeof m[k].dp === 'number' ? m[k].dp : null);

    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      asOf: new Date().toISOString(),
      vix: { value: pick('vix') },
      brent: { value: pick('brent') },
      dxy: { value: pick('dxy'), change1d: pct('dxy') },
      asia: { hangSeng: pct('hsi') ?? 0, nikkei: pct('nikkei') ?? 0, asx: pct('asx') ?? 0 },
      europe: { dax: pct('dax') ?? 0, obx: pct('obx') ?? 0, ftse: pct('ftse') ?? 0 },
      usa: { spx: pct('spx') ?? 0, ndx: pct('ndx') ?? 0, dow: pct('dow') ?? 0 },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Fetch failed' });
  }
}
