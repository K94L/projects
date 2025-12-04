export default async function handler(req, res) {
  const token = process.env.TWELVE_DATA_KEY;
  if (!token) {
    return res.status(500).json({ error: 'Missing TWELVE_DATA_KEY' });
  }

  const symbolMap = {
    vix: 'VIXY',
    brent: 'BNO',
    dxy: 'DXY',
    dxyAlt: 'UUP', // fallback if DXY is unavailable on the plan
    hsi: 'EWH',
    nikkei: 'EWJ',
    asx: 'EWA',
    dax: 'EWG',
    obx: 'ENOR',
    ftse: 'EWU',
    spx: 'SPY',
    ndx: 'QQQ',
    dow: 'DIA',
  };

  const symbols = Array.from(
    new Set([
      symbolMap.vix,
      symbolMap.brent,
      symbolMap.dxy,
      symbolMap.dxyAlt,
      symbolMap.hsi,
      symbolMap.nikkei,
      symbolMap.asx,
      symbolMap.dax,
      symbolMap.obx,
      symbolMap.ftse,
      symbolMap.spx,
      symbolMap.ndx,
      symbolMap.dow,
    ])
  );

  const chunk = (arr, size) => {
    const res = [];
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
    return res;
  };

  const fetchBatch = async (list) => {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(list.join(','))}&apikey=${token}`;
    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text();
      console.error('Twelve Data error', r.status, text);
      return {};
    }
    const json = await r.json();
    return json;
  };

  try {
    const chunks = chunk(symbols, 6);
    const results = await Promise.all(chunks.map(fetchBatch));
    const json = results.reduce((acc, cur) => Object.assign(acc, cur), {});

    // Twelve Data returns an object keyed by symbol when multiple symbols are requested
    const getPrice = (sym) => {
      const item = json[sym];
      if (!item || typeof item.price === 'undefined') return null;
      const num = Number(item.price);
      return Number.isFinite(num) ? num : null;
    };

    const getChangePct = (sym) => {
      const item = json[sym];
      if (!item || typeof item.percent_change === 'undefined') return null;
      const num = Number(item.percent_change);
      return Number.isFinite(num) ? num : null;
    };

    const data = {
      asOf: new Date().toISOString(),
      vix: { value: getPrice(symbolMap.vix) },
      brent: { value: getPrice(symbolMap.brent) },
      dxy: {
        value: getPrice(symbolMap.dxy) ?? getPrice(symbolMap.dxyAlt),
        change1d: getChangePct(symbolMap.dxy) ?? getChangePct(symbolMap.dxyAlt),
      },
      asia: {
        hangSeng: getChangePct(symbolMap.hsi),
        nikkei: getChangePct(symbolMap.nikkei),
        asx: getChangePct(symbolMap.asx),
      },
      europe: {
        dax: getChangePct(symbolMap.dax),
        obx: getChangePct(symbolMap.obx),
        ftse: getChangePct(symbolMap.ftse),
      },
      usa: {
        spx: getChangePct(symbolMap.spx),
        ndx: getChangePct(symbolMap.ndx),
        dow: getChangePct(symbolMap.dow),
      },
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
