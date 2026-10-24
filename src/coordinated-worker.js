/* Stateful worker: one circuit session, bounded advance requests, explicit stop. */
export const COORDINATED_WORKER_PROTOCOL = 'circuitbench-coordinated-worker-1';
let session = null, busy = false;
self.onmessage = async ({ data }) => {
  if (!data || !Number.isSafeInteger(data.id) || busy) return;
  busy = true;
  try {
    let result;
    if (data.type === 'initialize') {
      if (session) throw new Error('A coordinated circuit is already initialized.');
      const { createCoordinatedSession } = await import('./coordinated.js');
      session = createCoordinatedSession(data.plan);
      result = { time: session.time, stats: session.stats };
    } else if (data.type === 'advance') {
      if (!session) throw new Error('Initialize the coordinated circuit before advancing it.');
      result = session.advanceTo(data.end, { maxSteps: data.maxSteps });
    } else if (data.type === 'inputs') {
      if (!session) throw new Error('Initialize the coordinated circuit before changing inputs.');
      result = session.setInputs(data.updates);
      result = { time: session.time, applied: result ?? data.updates };
    } else throw new Error('Unsupported coordinated worker operation.');
    self.postMessage({ type: 'result', id: data.id, result });
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, message: error?.message || String(error), code: error?.code || 'COORDINATED_FAILED', phase: error?.phase || 'coordinated-simulation' });
  } finally { busy = false; }
};
self.postMessage({ type: 'ready', protocol: COORDINATED_WORKER_PROTOCOL });
