import { escapeHTML as esc } from './storage.js';
import { formatNumber } from './plots.js';
import { parseValue } from './library.js';
import { normalizeCaptureRequest } from './capture.js';

export function captureSignals(run) {
  return (run?.result?.vectors ?? []).filter(vector => vector.name !== 'time').flatMap(vector => {
    const measurement = run.measurements?.find(item => item.vector?.toLowerCase() === vector.name.toLowerCase());
    const label = measurement?.label ?? vector.name;
    if (vector.kind === 'bus') return Array.from({ length: vector.width }, (_, bit) => ({ kind: 'digital', signal: vector.name, bit, label: `${label} [bit ${bit}]`, unit: 'logic' }));
    return [{ kind: vector.kind === 'logic' ? 'digital' : 'analog', signal: vector.name, label, unit: vector.unit }];
  });
}

export function captureStatusHTML(capture, lastEvent) {
  const eventStatus = lastEvent ? `<p class="helper" role="status">${esc(['search-limit', 'work-limit'].includes(lastEvent.kind) ? lastEvent.reason : `Stopped at ${formatNumber(lastEvent.time, 's', 8)} · ${lastEvent.reason ?? lastEvent.method}`)}${lastEvent.searchedUntil !== undefined ? ` Searched through ${esc(formatNumber(lastEvent.searchedUntil, 's', 8))} of ${esc(formatNumber(lastEvent.requestedEnd, 's', 8))}.` : ''}</p>` : '';
  const navigation = lastEvent && ['event', 'search-limit', 'work-limit'].includes(lastEvent.kind) ? eventStatus : '';
  if (capture?.status === 'cancelled') return `<p class="helper capture-status" role="status">${esc(capture.reason ?? 'Capture cancelled. Configure and rearm when ready.')}</p>${navigation}`;
  if (!capture) return eventStatus;
  const text = capture.status === 'armed' ? `Trigger armed; searching until ${formatNumber(capture.searchEnd, 's', 8)}.`
    : capture.status === 'post-trigger' ? `Triggered at ${formatNumber(capture.event.time, 's', 8)}; collecting the declared post-trigger window.`
      : capture.status === 'not-found' ? capture.reason
        : `Capture complete at ${formatNumber(capture.event.time, 's', 8)}. ${capture.coverage?.status === 'partial' ? 'Some requested history is unavailable.' : 'Requested history is covered.'}`;
  return `<p class="helper capture-status" role="status">${esc(text)}</p>${['complete', 'not-found'].includes(capture.status) ? navigation : ''}`;
}

export function captureSetupHTML(run, { session, records = [] } = {}) {
  const signals = captureSignals(run), duration = session?.plan?.duration ?? .01, active = session?.running && signals.length;
  const history = `<h3>Saved captures</h3>${records.length ? records.slice().reverse().map(record => `<button type="button" data-capture-history="${esc(record.id)}">${esc(record.run.projectSnapshot.title)} · ${esc(formatNumber(record.event.time, 's', 7))} · ${esc(record.coverage.status)}</button>`).join(' ') : '<p class="helper">No saved captures yet.</p>'}`;
  if (!active) return `<p>Start Continuous simulation, then choose Capture or Run until after at least one completed update. Opening setup pauses at a completed boundary. Triggers observe the actual shared analog/digital solver timeline.</p>${history}`;
  return `<p>This session is paused at a completed boundary. Arm a trigger to continue until its declared condition. Analog thresholds are located on the accepted numerical step; reduce the maximum step to assess numerical sensitivity.</p>
    <div class="field-row"><label class="field">Trigger signal<select id="capture-signal">${signals.map((item, index) => `<option value="${index}">${esc(item.label)} · ${esc(item.unit)}</option>`).join('')}</select></label>
    <label class="field">Edge<select id="capture-edge"><option value="rising">Rising</option><option value="falling">Falling</option><option value="either">Either</option></select></label></div>
    <label class="field" id="capture-threshold-field">Analog threshold (signal units)<input id="capture-threshold" value="1"></label>
    <div class="field-row"><label class="field">Pre-trigger history (s)<input id="capture-before" value="${duration / 4}"></label><label class="field">Post-trigger history (s)<input id="capture-after" value="${duration / 4}"></label><label class="field">Maximum search duration (s)<input id="capture-search" value="${duration}"></label></div>
    <p class="helper">Only direct 0→1 or 1→0 transitions count as digital edges; X/Z is never guessed. Live input changes can trigger at their applied boundary. Captures retain bounded original samples, input history and circuit revision. Missing pre-trigger history is reported explicitly. Run until event uses no post-trigger delay.</p>
    ${captureStatusHTML(session.capture, session.lastEvent)}<div id="capture-error" class="notice error" role="alert" hidden></div>
    <div class="dialog-actions"><button id="capture-until">Run until event</button><button id="capture-arm" class="primary">Arm capture & run</button>${['armed', 'post-trigger'].includes(session.capture?.status) ? '<button id="capture-cancel">Cancel armed capture</button>' : ''}</div>${history}`;
}

export function updateCaptureSetup(container, run) {
  const signal = captureSignals(run)[Number(container.querySelector('#capture-signal')?.value)];
  const field = container.querySelector('#capture-threshold-field'); if (field) field.hidden = signal?.kind !== 'analog';
}

export function readCaptureSetup(container, run, mode = 'capture') {
  const item = captureSignals(run)[Number(container.querySelector('#capture-signal')?.value)];
  if (!item) throw new Error('Choose a retained signal for the trigger.');
  const trigger = { kind: item.kind, signal: item.signal, edge: container.querySelector('#capture-edge').value, ...(item.bit !== undefined ? { bit: item.bit } : {}), ...(item.kind === 'analog' ? { threshold: parseValue(container.querySelector('#capture-threshold').value, item.unit) } : {}) };
  return normalizeCaptureRequest({ mode, trigger, before: parseValue(container.querySelector('#capture-before').value, 's'), after: parseValue(container.querySelector('#capture-after').value, 's'), search: parseValue(container.querySelector('#capture-search').value, 's') });
}

export function captureResultHTML(record, project) {
  const c = record.coverage, historical = project && (record.run.projectId !== project.id || record.run.revision !== project.revision);
  return `<article class="capture-record"><h3>${esc(record.run.projectSnapshot.title)} · triggered capture</h3><p>Source run ${esc(record.sourceRunId)} · circuit revision ${record.run.revision} · ${esc(record.createdAt)}${historical ? ' · historical circuit snapshot' : ''}</p>
    <table><tbody><tr><th>Trigger</th><td>${esc(record.request.trigger.signal)}${record.request.trigger.bit !== undefined ? ` [bit ${record.request.trigger.bit}]` : ''} · ${esc(record.request.trigger.edge)}${record.request.trigger.kind === 'analog' ? ` through ${esc(String(record.request.trigger.threshold))}` : ''}</td></tr><tr><th>Event time</th><td>${esc(formatNumber(record.event.time, 's', 9))} · ${esc(record.event.method)}</td></tr><tr><th>Requested window</th><td>${esc(formatNumber(c.requestedStart, 's', 9))} to ${esc(formatNumber(c.requestedEnd, 's', 9))}</td></tr><tr><th>Retained original samples</th><td>${record.run.result.points} · ${esc(formatNumber(c.actualStart, 's', 9))} to ${esc(formatNumber(c.actualEnd, 's', 9))}</td></tr><tr><th>Unavailable history</th><td>Before: ${esc(formatNumber(c.missingBefore, 's', 8))} · after: ${esc(formatNumber(c.missingAfter, 's', 8))} · ${esc(c.status)}</td></tr></tbody></table><p class="helper">${esc(c.description)} Saved captures are non-resumable numerical evidence.</p></article>`;
}

export const captureReportHTML = (records, { project } = {}) => records?.length ? `<section><h2>Triggered captures</h2>${records.map(record => captureResultHTML(record, project)).join('')}</section>` : '';
