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
      const price = Number(item.price);
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
    const hsiQ = pickFirst(json, symbolMap.hsi);
    const nikkeiQ = pickFirst(json, symbolMap.nikkei);
    const asxQ = pickFirst(json, symbolMap.asx);
    const daxQ = pickFirst(json, symbolMap.dax);
    const obxQ = pickFirst(json, symbolMap.obx);
    const ftseQ = pickFirst(json, symbolMap.ftse);
    const spxQ = pickFirst(json, symbolMap.spx);
    const ndxQ = pickFirst(json, symbolMap.ndx);
    const dowQ = pickFirst(json, symbolMap.dow);

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
