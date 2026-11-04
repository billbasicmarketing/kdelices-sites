// Calcule la distance et le temps de trajet depuis la boutique, avec OpenRouteService.
// La clé reste côté serveur : variable secrète ORS_API_KEY (réglage Cloudflare Pages).
const HOME_ADDRESS = '25 rue de Ruze, 77270 Villeparisis, France';
const HOME_FALLBACK = [2.613, 48.942]; // [longitude, latitude] approximatif de Villeparisis
let homeCache = null;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function ors(env, path, params) {
  const u = new URL('https://api.openrouteservice.org' + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('api_key', env.ORS_API_KEY);
  const r = await fetch(u);
  if (!r.ok) throw new Error('ors ' + r.status);
  return r.json();
}

async function home(env) {
  if (homeCache) return homeCache;
  try {
    const g = await ors(env, '/geocode/search', { text: HOME_ADDRESS, 'boundary.country': 'FR', size: 1 });
    const c = g.features?.[0]?.geometry?.coordinates;
    if (c) homeCache = c;
  } catch {}
  return homeCache || HOME_FALLBACK;
}

export async function onRequestGet({ request, env }) {
  const address = (new URL(request.url).searchParams.get('address') || '').trim().slice(0, 200);
  if (address.length < 6) return json({ error: 'not_found' }, 400);
  if (!env.ORS_API_KEY) return json({ error: 'config' }, 500);
  try {
    const g = await ors(env, '/geocode/search', { text: address, 'boundary.country': 'FR', size: 1 });
    const f = g.features?.[0];
    if (!f || (f.properties?.confidence ?? 1) < 0.3) return json({ error: 'not_found' }, 404);
    const [lon, lat] = f.geometry.coordinates;
    const h = await home(env);
    const d = await ors(env, '/v2/directions/driving-car', { start: h.join(','), end: lon + ',' + lat });
    const s = d.features[0].properties.summary;
    return json({ km: Math.round(s.distance / 1000), min: Math.round(s.duration / 60), label: f.properties.label });
  } catch (e) {
    return json({ error: 'service' }, 502);
  }
}
