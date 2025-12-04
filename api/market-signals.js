export default async function handler(req, res) {
  const token = process.env.FINNHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Missing FINNHUB_TOKEN' });
  }

  // Symbols picked to stay within Finnhub free tier (ETF proxies only)
  const symbols = {
    vix: ['VIXY', 'VXX'], // VIX ETFs
    brent: ['USO', 'BNO'], // crude ETFs
    dxy: ['UUP'], // dollar index ETF
    hsi: ['EWH'], // HK ETF proxy
    nikkei: ['EWJ'], // Japan ETF proxy
    asx: ['EWA'], // Australia ETF proxy
    dax: ['EWG'], // Germany ETF proxy
    obx: ['ENOR'], // Norway ETF proxy
    ftse: ['EWU'], // UK ETF proxy
    spx: ['SPY'],
    ndx: ['QQQ'],
    dow: ['DIA'],
  };

  const fetchQuote = async (sym) => {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${token}`;
    try {
      const r = await fetch(url);
      if (!r.ok) {
        console.error('Quote failed', sym, r.status);
        return { ok: false, status: r.status };
      }
      const json = await r.json();
      return { ok: true, data: json };
    } catch (err) {
      console.error('Quote error', sym, err);
      return { ok: false, status: 500 };
    }
  };

  const firstValid = async (candidates) => {
    for (const sym of candidates) {
      const result = await fetchQuote(sym);
      if (result.ok && result.data && typeof result.data.c === 'number') {
        return result.data;
      }
    }
    return null;
  };

  try {
    const entries = await Promise.all(
      Object.entries(symbols).map(async ([k, list]) => [k, await firstValid(Array.isArray(list) ? list : [list])])
    );
    const m = Object.fromEntries(entries);
    const pick = (k) => (m[k] && typeof m[k].c === 'number' ? m[k].c : null);
    const pct = (k) => (m[k] && typeof m[k].dp === 'number' ? m[k].dp : null);

    const data = {
      asOf: new Date().toISOString(),
      vix: { value: pick('vix') ?? null },
      brent: { value: pick('brent') ?? null },
      dxy: { value: pick('dxy') ?? null, change1d: pct('dxy') ?? null },
      asia: { hangSeng: pct('hsi') ?? null, nikkei: pct('nikkei') ?? null, asx: pct('asx') ?? null },
      europe: { dax: pct('dax') ?? null, obx: pct('obx') ?? null, ftse: pct('ftse') ?? null },
      usa: { spx: pct('spx') ?? null, ndx: pct('ndx') ?? null, dow: pct('dow') ?? null },
    };

    const availablePrices = ['vix', 'brent', 'dxy'].filter((k) => data[k].value !== null).length;
    const availableChanges =
      ['hangSeng', 'nikkei', 'asx', 'dax', 'obx', 'ftse', 'spx', 'ndx', 'dow'].filter(
        (k) =>
          data.asia[k] !== undefined
            ? data.asia[k] !== null
            : data.europe[k] !== undefined
              ? data.europe[k] !== null
              : data.usa[k] !== null
      ).length;

    if (availablePrices === 0 && availableChanges === 0) {
      return res.status(502).json({ error: 'No data returned from provider' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.json(data);
  } catch (err) {
    console.error(err);
    if (err && err.status === 429) {
      return res.status(429).json({ error: 'Rate limited by Finnhub' });
    }
    return res.status(500).json({ error: 'Fetch failed' });
  }
}
