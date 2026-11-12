// All ranking writes pass through the shared replay engine. Never trust a submitted score.
import { createRunService, RunError } from '../../../shared/run-service.mjs';
const URL = Deno.env.get('SUPABASE_URL')!;
const ADMIN = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
async function rpc(name: string, args: object) {
  const response = await fetch(`${URL}/rest/v1/rpc/${name}`, { method: 'POST',
    headers: { apikey: ADMIN, Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const data = await response.json();
  if (!response.ok) {
    const known: Record<string, number> = { rate_limited: 429, profile_required: 409, run_closed: 409, run_expired: 410 };
    throw new RunError(known[data.message] ? data.message : 'storage_unavailable', known[data.message] || 503);
  }
  return data;
}
const store = {
  getRun: (user: string, id: string) => rpc('endless_get_run', { p_user: user, p_id: id }),
  start: (run: any) => rpc('endless_start_run', { p_run: run }),
  receipt: (id: string, seq: number) => rpc('endless_receipt', { p_id: id, p_seq: seq }),
  batch: ({ run, seq, fingerprint, inputs, state }: any) => rpc('endless_commit_batch', { p_id: run.id, p_user: run.user_id, p_seq: seq, p_hash: fingerprint, p_inputs: inputs, p_state: state }),
  finish: (run: any) => rpc('endless_finish_run', { p_id: run.id, p_user: run.user_id, p_seq: run.seq }),
  leaderboard: (day: string, version: string, user: string | null) => rpc('endless_leaderboard', { p_day: day, p_version: version, p_user: user })
};
const service = createRunService({ store, digest: async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(v => v.toString(16).padStart(2, '0')).join('') });
Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Vary: 'Origin', 'Cache-Control': 'no-store' };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
  headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.includes(origin)) return json({ error: 'origin_not_allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    const url = new globalThis.URL(request.url), path = url.pathname.replace(/^.*\/endless\/?/, '');
    const token = request.headers.get('authorization'); let user = null;
    if (token) {
      // getUser verifies the bearer token with Auth; never decode a JWT and trust its user ID.
      const auth = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: PUBLIC_KEY, Authorization: token } });
      if (!auth.ok) throw new RunError('sign_in_required', 401);
      user = (await auth.json()).id;
    }
    if (request.method === 'GET' && path === 'leaderboard') return json(await service.leaderboard(user, url.searchParams.get('day')));
    if (request.method === 'GET' && /^runs\/[\da-f-]+$/i.test(path)) return json(await service.status(user, path.split('/')[1]));
    if (request.method !== 'POST') return json({ error: 'not_found' }, 404);
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > 10000) throw new RunError('payload_too_large', 413);
    const reader = request.body?.getReader(); let bytes = 0, text = ''; const decoder = new TextDecoder();
    if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length;
      if (bytes > 10000) { await reader.cancel(); throw new RunError('payload_too_large', 413); } text += decoder.decode(value, { stream: true }); }
    let body; try { body = JSON.parse(text + decoder.decode()); } catch (_) { throw new RunError('invalid_json'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RunError('invalid_json');
    if (path === 'runs/start') return json(await service.start(user, body));
    const match = path.match(/^runs\/([\da-f-]+)\/(inputs|finish)$/i);
    if (match) return json(await (match[2] === 'inputs' ? service.inputs(user, match[1], body) : service.finish(user, match[1], body)));
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    if (error instanceof RunError) return json({ error: error.code }, error.status);
    console.error('endless request failed', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'temporarily_unavailable' }, 503);
  }
});
