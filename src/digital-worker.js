/* Disposable digital worker: startup is visible before the local kernel import. */
export const DIGITAL_WORKER_PROTOCOL = 'circuitbench-digital-worker-2';
let started = false;
self.onmessage = async ({ data }) => {
  if (!['run', 'truth-table'].includes(data?.type) || started) return;
  started = true;
  try {
    self.postMessage({ type: 'log', message: data.type === 'truth-table' ? 'Enumerating a bounded truth table in a separate worker…' : 'Running four-state event logic in a separate worker…' });
    const { simulateDigital, generateTruthTable } = await import('./digital.js');
    const result = data.type === 'truth-table' ? generateTruthTable(data.plan, { inputIds: data.inputIds, outputNames: data.outputNames }) : simulateDigital(data.plan, { sources: data.sources });
    self.postMessage({ type: 'result', result });
  } catch (error) { self.postMessage({ type: 'error', message: error?.message || String(error), code: error?.code || 'DIGITAL_RUN_FAILED', phase: error?.phase || 'digital-simulation' }); }
};
self.postMessage({ type: 'ready', protocol: DIGITAL_WORKER_PROTOCOL });
