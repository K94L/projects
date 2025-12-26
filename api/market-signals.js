export default async function handler(req, res) {
  const token = process.env.TWELVE_DATA_KEY;
  if (!token) {
    return res.status(500).json({ error: 'Missing TWELVE_DATA_KEY' });
  }

  // Simple in-memory cache to limit Twelve Data calls within a deployment instance
  const CACHE_TTL_MS = 300000; // 5 minutes
  const now = Date.now();
  globalThis.__MARKET_CACHE = globalThis.__MARKET_CACHE || { data: null, fetchedAt: 0 };
  const cache = globalThis.__MARKET_CACHE;
  const isFresh = cache.data && now - cache.fetchedAt < CACHE_TTL_MS;
  if (isFresh) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.json(cache.data);
  }

  try {
    // Keep symbol list minimal to reduce credits
    const priceSymbols = ['VIXM', 'USD/JPY', 'EUR/USD', 'GBP/USD', 'USD/CAD', 'USD/SEK', 'USD/CHF'];
    const DXY_WEIGHTS = [
      { symbol: 'EUR/USD', weight: -0.576 },
      { symbol: 'USD/JPY', weight: 0.136 },
      { symbol: 'GBP/USD', weight: -0.119 },
      { symbol: 'USD/CAD', weight: 0.091 },
      { symbol: 'USD/SEK', weight: 0.042 },
      { symbol: 'USD/CHF', weight: 0.036 },
    ];

    const fetchPrice = async (symbol) => {
      const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${token}`;
      const r = await fetch(url);
      if (!r.ok) {
        const text = await r.text();
        console.error('Twelve Data price error', symbol, r.status, text);
        if (r.status === 429) {
          const err = new Error('Rate limited by provider');
          err.status = 429;
          throw err;
        }
        throw new Error(`Upstream fetch failed for ${symbol}`);
      }
      const json = await r.json();
      if (json && json.status === 'error') {
        const err = new Error(json.message || 'Upstream error');
        err.status = 502;
        throw err;
      }
      const price = Number(json.price);
      if (!Number.isFinite(price)) {
        const err = new Error(`Missing price for ${symbol}`);
        err.status = 502;
        throw err;
      }
      return price;
    };

    const fetchFredBrent = async () => {
      const fredKey = process.env.FRED_KEY;
      if (!fredKey) return null;
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DCOILBRENTEU&api_key=${encodeURIComponent(fredKey)}&file_type=json&sort_order=desc&limit=1`;
      const r = await fetch(url);
      if (!r.ok) {
        const text = await r.text();
        console.error('FRED Brent error', r.status, text);
        return null;
      }
      const json = await r.json();
      const obs = json && Array.isArray(json.observations) ? json.observations[0] : null;
      const val = obs ? Number(obs.value) : null;
      return Number.isFinite(val) ? val : null;
    };

    const prices = await Promise.all(priceSymbols.map((sym) => fetchPrice(sym)));
    const fredBrent = await fetchFredBrent();
    const priceMap = {};
    priceSymbols.forEach((sym, idx) => {
      priceMap[sym] = prices[idx];
    });

    const dxyValue = DXY_WEIGHTS.reduce((acc, { symbol, weight }) => {
      const px = Number(priceMap[symbol]);
      if (!Number.isFinite(px) || px <= 0) return acc;
      return acc * Math.pow(px, weight);
    }, 50.14348112);

    const vixPrice = priceMap['VIXM'];
    const usdJpyPrice = priceMap['USD/JPY'];

    const data = {
      asOf: new Date().toISOString(),
      dxy: { value: Number.isFinite(dxyValue) ? dxyValue : 0, change1d: null },
      vix: { value: Number.isFinite(vixPrice) ? vixPrice : 0 },
      usdjpy: { value: Number.isFinite(usdJpyPrice) ? usdJpyPrice : 0 },
      brent: { value: Number.isFinite(fredBrent) ? fredBrent : 0 },
    };

    if (!Number.isFinite(data.dxy.value) && !Number.isFinite(data.vix.value)) {
      console.error('Missing expected data from Twelve Data payload', json);
      return res.status(502).json({ error: 'Upstream missing data' });
    }

    cache.data = data;
    cache.fetchedAt = now;

    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.json(cache.data);
  } catch (err) {
    console.error(err);
    if (cache.data) {
      // Serve stale cache if available
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
      return res.json(cache.data);
    }
    const fallback = {
      asOf: new Date().toISOString(),
      dxy: { value: 0, change1d: null },
      vix: { value: 0 },
      usdjpy: { value: 0 },
      brent: { value: 0 },
    };
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return res.json(fallback);
  }
}
