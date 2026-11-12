import './endless.js';
const Core = globalThis.EndlessCore;
export class RunError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const uuid = value => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export function createRunService({ store, now = Date.now, randomUUID = () => crypto.randomUUID(), digest }) {
  const fail = (code, status) => { throw new RunError(code, status); };
  async function owned(user, id) {
    if (!user) fail('sign_in_required', 401);
    if (!uuid(id)) fail('invalid_run');
    const run = await store.getRun(user, id);
    if (!run) fail('run_not_found', 404);
    if (run.version !== Core.RULES.version) fail('unsupported_rules', 409);
    return run;
  }
  function active(run) {
    if (run.status !== 'active') fail('run_closed', 409);
    if (now() - Date.parse(run.updated_at) > Core.RULES.idleMs) fail('run_expired', 410);
  }
  const summary = run => ({ id: run.id, day: run.day, version: run.version, seed: run.seed,
    status: run.status, tick: run.state.tick, seq: run.seq, score: run.state.score,
    distance: run.state.distance, bosses: run.state.bosses, clean: run.state.clean });
  return {
    async start(user, body) {
      if (!user) fail('sign_in_required', 401);
      if (!uuid(body.requestId)) fail('invalid_request_id');
      const day = Core.dayAt(now()), seed = Core.dailySeed(day), state = Core.create(seed);
      return summary(await store.start({ id: randomUUID(), user_id: user, request_id: body.requestId,
        day, seed, version: Core.RULES.version, state }));
    },
    async inputs(user, id, body) {
      const run = await owned(user, id);
      if (!Number.isSafeInteger(body.seq) || body.seq < 0 || !Number.isSafeInteger(body.fromTick) || body.fromTick < 0) fail('invalid_sequence');
      if (!Array.isArray(body.inputs) || !body.inputs.length || body.inputs.length > Core.RULES.inputBatch ||
        body.inputs.some(x => !Number.isInteger(x) || Math.abs(x) > Core.RULES.maxX)) fail('invalid_inputs');
      const fingerprint = await digest(JSON.stringify([body.fromTick, body.inputs]));
      if (body.seq < run.seq) {
        const receipt = await store.receipt(id, body.seq);
        if (!receipt || receipt.fingerprint !== fingerprint) fail('duplicate_mismatch', 409);
        return { ...summary(run), duplicate: true };
      }
      active(run);
      if (body.seq !== run.seq || body.fromTick !== run.state.tick) fail('out_of_order', 409);
      const endTick = body.fromTick + body.inputs.length;
      if (endTick > Math.floor((now() - Date.parse(run.created_at) + 1500) * Core.RULES.hz / 1000)) fail('too_fast', 429);
      let state;
      try { state = Core.replay(run.state, body.inputs); } catch (_) { fail('invalid_replay'); }
      const saved = await store.batch({ run, seq: body.seq, fingerprint, inputs: body.inputs, state });
      if (!saved) fail('out_of_order', 409);
      return summary(saved);
    },
    async finish(user, id, body) {
      const run = await owned(user, id);
      if (!Number.isSafeInteger(body.tick) || body.tick !== run.state.tick || !Number.isSafeInteger(body.seq) || body.seq !== run.seq) fail('unverified_inputs', 409);
      if (run.status === 'finished') return summary(run);
      active(run);
      if (run.state.tick < 1) fail('empty_run');
      if (!run.state.finished && body.reason !== 'quit') fail('run_not_finished', 409);
      return summary(await store.finish(run));
    },
    async status(user, id) { return summary(await owned(user, id)); },
    async leaderboard(user, day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) fail('invalid_day');
      return store.leaderboard(day, Core.RULES.version, user || null);
    }
  };
}
