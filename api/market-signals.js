export default async function handler(req, res) {
  const token = process.env.TWELVE_DATA_KEY;
  if (!token) {
    return res.status(500).json({ error: 'Missing TWELVE_DATA_KEY' });
  }

  const symbolMap = {
    vix: ['VIXY', 'VXX'],
    brent: ['BNO', 'USO'],
    dxy: ['DXY', 'UUP'],
    hsi: ['EWH'],
    nikkei: ['EWJ'],
    asx: ['EWA'],
    dax: ['EWG'],
    obx: ['ENOR'],
    ftse: ['EWU'],
    spx: ['SPY'],
    ndx: ['QQQ'],
    dow: ['DIA'],
  };

  const fetchQuote = async (sym) => {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(sym)}&apikey=${token}`;
    try {
      const r = await fetch(url);
      if (!r.ok) {
        const text = await r.text();
        console.error('Twelve Data error', sym, r.status, text);
        return null;
      }
      const json = await r.json();
      const price = Number(json?.price);
      const pct = Number(json?.percent_change);
      return { price: Number.isFinite(price) ? price : null, pct: Number.isFinite(pct) ? pct : null };
    } catch (err) {
      console.error('Quote fetch failed', sym, err);
      return null;
    }
  };

  const firstAvailable = async (list) => {
    for (const sym of list) {
      const q = await fetchQuote(sym);
      if (q && (q.price !== null || q.pct !== null)) return q;
    }
    return null;
  };

  try {
    const [
      vixQ,
      brentQ,
      dxyQ,
      hsiQ,
      nikkeiQ,
      asxQ,
      daxQ,
      obxQ,
      ftseQ,
      spxQ,
      ndxQ,
      dowQ,
    ] = await Promise.all([
      firstAvailable(symbolMap.vix),
      firstAvailable(symbolMap.brent),
      firstAvailable(symbolMap.dxy),
      firstAvailable(symbolMap.hsi),
      firstAvailable(symbolMap.nikkei),
      firstAvailable(symbolMap.asx),
      firstAvailable(symbolMap.dax),
      firstAvailable(symbolMap.obx),
      firstAvailable(symbolMap.ftse),
      firstAvailable(symbolMap.spx),
      firstAvailable(symbolMap.ndx),
      firstAvailable(symbolMap.dow),
    ]);

    const data = {
      asOf: new Date().toISOString(),
      vix: { value: vixQ?.price ?? null },
      brent: { value: brentQ?.price ?? null },
      dxy: { value: dxyQ?.price ?? null, change1d: dxyQ?.pct ?? null },
      asia: {
        hangSeng: hsiQ?.pct ?? null,
        nikkei: nikkeiQ?.pct ?? null,
        asx: asxQ?.pct ?? null,
      },
      europe: {
        dax: daxQ?.pct ?? null,
        obx: obxQ?.pct ?? null,
        ftse: ftseQ?.pct ?? null,
      },
      usa: {
        spx: spxQ?.pct ?? null,
        ndx: ndxQ?.pct ?? null,
        dow: dowQ?.pct ?? null,
      },
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
