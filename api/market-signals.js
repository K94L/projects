export default async function handler(req, res) {
  const token = process.env.TWELVE_DATA_KEY;
  if (!token) {
    return res.status(500).json({ error: 'Missing TWELVE_DATA_KEY' });
  }

  const symbolMap = {
    vix: ['VIXM', 'VIX', 'VIXY', 'VXX'],
    brent: ['CO1', 'CO1:COM', 'BZ=F', 'BNO', 'USO'],
    dxy: ['USD/JPY', 'USDJPY', 'JPY=X'],
  };

  const symbolsFlat = Array.from(
    new Set(
      Object.values(symbolMap)
        .flat()
        .filter(Boolean)
    )
  );

  const fetchBatch = async (list) => {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(list.join(','))}&apikey=${token}`;
    try {
      const r = await fetch(url);
      if (!r.ok) {
        const text = await r.text();
        console.error('Twelve Data batch error', r.status, text);
        return {};
      }
      const json = await r.json();
      return json;
    } catch (err) {
      console.error('Batch fetch failed', err);
      return {};
    }
  };

  const pickFirst = (json, list) => {
    for (const sym of list) {
      const item = json[sym];
      if (!item) continue;
      const priceCandidates = [item.price, item.last, item.close];
      const price = priceCandidates.map((v) => Number(v)).find((v) => Number.isFinite(v) && v > 0);
      const pct = Number(item.percent_change);
      const priceVal = Number.isFinite(price) ? price : null;
      const pctVal = Number.isFinite(pct) ? pct : null;
      if (priceVal !== null || pctVal !== null) {
        return { price: priceVal, pct: pctVal };
      }
    }
    return { price: null, pct: null };
  };

  try {
    const json = await fetchBatch(symbolsFlat);
    const vixQ = pickFirst(json, symbolMap.vix);
    const brentQ = pickFirst(json, symbolMap.brent);
    const dxyQ = pickFirst(json, symbolMap.dxy);

    const data = {
      asOf: new Date().toISOString(),
      vix: { value: vixQ?.price ?? null },
      brent: { value: brentQ?.price ?? null },
      dxy: { value: dxyQ?.price ?? null, change1d: dxyQ?.pct ?? null },
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
