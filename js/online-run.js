(function (scope) {
'use strict';
class OnlineRun {
  constructor(run, user, request, changed = () => {}) {
    Object.assign(this, { id: run.id, day: run.day, user, request, changed, version: run.version, seq: 0, acknowledged: 0,
      pending: [], uploading: null, valid: true, status: '연결됨', ending: false, result: null, lastAck: Date.now(), retryAt: 0 });
  }
  invalidate(message) { this.valid = false; this.pending.length = 0; this.status = message; this.changed(); }
  record(target) {
    if (!this.valid || this.ending) return;
    if (this.pending.length >= scope.EndlessCore.RULES.maxPending || Date.now() - this.lastAck > scope.EndlessCore.RULES.idleMs) {
      this.invalidate('연결이 오래 끊겨 연습 기록으로 전환했어요.'); return;
    }
    this.pending.push(target);
    if (this.pending.length >= scope.EndlessCore.RULES.inputBatch && !this.uploading && Date.now() >= this.retryAt) this.flush().catch(() => {});
  }
  async flush(force = false) {
    if (this.uploading) { await this.uploading; if (force && this.pending.length) return this.flush(true); return; }
    if (!this.valid) throw new Error('unranked');
    if (!this.pending.length || (!force && this.pending.length < scope.EndlessCore.RULES.inputBatch)) return;
    this.uploading = (async () => {
      while (this.valid && this.pending.length && (force || this.pending.length >= scope.EndlessCore.RULES.inputBatch)) {
        const inputs = this.pending.slice(0, scope.EndlessCore.RULES.inputBatch), fromTick = this.acknowledged, seq = this.seq;
        try {
          const ack = await this.request('runs/' + this.id + '/inputs', { seq, fromTick, inputs });
          if (!this.valid) return;
          if (ack.tick !== fromTick + inputs.length || ack.seq !== seq + 1) throw Object.assign(new Error('inconsistent_ack'), { status: 409 });
          this.pending.splice(0, inputs.length); this.seq = ack.seq; this.acknowledged = ack.tick; this.lastAck = Date.now();
          this.status = '연결됨'; this.changed();
        } catch (e) {
          if ([400, 401, 403, 404, 409, 410].includes(e.status)) this.invalidate('기록을 확인하지 못해 연습 기록으로 전환했어요.');
          else { this.retryAt = Date.now() + 3000; this.status = '다시 연결하는 중'; this.changed(); }
          throw e;
        }
      }
    })();
    try { await this.uploading; } finally { this.uploading = null; }
  }
  async finish(reason) {
    if (this.result) return this.result;
    this.ending = true; this.status = '기록 확인 중'; this.changed();
    await this.flush(true);
    if (!this.valid) throw new Error('unranked');
    let result;
    try { result = await this.request('runs/' + this.id + '/finish', { tick: this.acknowledged, seq: this.seq, reason }); }
    catch (e) {
      if ([400, 401, 403, 404, 409, 410].includes(e.status)) this.invalidate('기록을 확인하지 못해 연습 기록으로 남겼어요.');
      else { this.status = '등록을 기다리고 있어요. 연결 후 다시 시도해 주세요.'; this.changed(); }
      throw e;
    }
    if (!this.valid) throw new Error('unranked');
    this.result = result; this.status = '기록 등록 완료'; this.changed(); return result;
  }
}
scope.OnlineRun = OnlineRun;
if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRun;
})(globalThis);
