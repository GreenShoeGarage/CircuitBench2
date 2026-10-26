import { escapeHTML as esc } from './storage.js';

const labels = {passed:'Passed',failed:'Failed',unavailable:'Unavailable',partial:'Completed with limits',running:'Checking…',cancelled:'Cancelled'};
export function installationReportJSON(report) {
  if (report?.format !== 'CircuitBench installation check' || report.formatVersion !== 1) throw new Error('Choose a completed CircuitBench installation check.');
  return JSON.stringify(report,null,2)+'\n';
}
export function installationReportFilename(report) {
  const version = String(report?.version ?? 'unknown').replace(/[^A-Za-z0-9.+-]/g,'-').slice(0,64);
  return `CircuitBench-${version}-installation-check.json`;
}
export function installationRepairURL(baseURL,version) {
  const base = new URL(baseURL);
  if (!['http:','https:'].includes(base.protocol) || base.username || base.password || !base.pathname.endsWith('/')) throw new Error('A valid application directory is required for recovery.');
  base.search = ''; base.hash = '';
  const url = new URL('repair/',base); url.searchParams.set('release',String(version).slice(0,64)); return url.href;
}
/** Dialog body only. The owning application controls lifecycle, cancellation and download. */
export function installationCheckHTML(report = null,{running = report?.status === 'running',repairURL = '',disabledReason = ''} = {}) {
  const checks = report?.checks ?? [], assets = checks.filter(check => check.id.startsWith('asset:')), other = checks.filter(check => !check.id.startsWith('asset:'));
  const row = check => `<li class="installation-check-row" data-check-status="${esc(check.status)}"><strong>${esc(check.label)}</strong><span class="installation-check-state">${esc(labels[check.status] ?? check.status)}</span><p>${esc(check.message)}</p>${check.phase ? `<p class="helper">Stage: ${esc(check.phase)}</p>` : ''}${check.assetUrl && check.status === 'failed' ? `<p class="helper mono">${esc(check.assetUrl)}</p>` : ''}</li>`;
  const summary = report ? `${report.summary?.passed ?? 0} passed · ${report.summary?.failed ?? 0} failed · ${report.summary?.unavailable ?? 0} unavailable` : 'Check the uploaded runtime and run three small, independent test circuits.';
  let repair = '';
  if (repairURL) { try { const url = new URL(repairURL); if (['http:','https:'].includes(url.protocol) && !url.username && !url.password) repair = `<a class="button outline" href="${esc(url.href)}" target="_blank" rel="noopener">Open cache repair</a>`; } catch {} }
  return `<section class="installation-check"><p>Inspect this installation’s release files, digital worker, coordinated feedback worker and ngspice WebAssembly engine. Your circuit and saved projects are not used or changed.</p><p class="notice">This checks connected operation. Offline reload, upgrades, recovery and downloaded outputs require separate acceptance.</p>${disabledReason ? `<p class="notice">${esc(disabledReason)}</p>` : ''}<div class="object-actions"><button type="button" data-installation-action="run" ${running || disabledReason ? 'disabled' : ''}>${report ? 'Check again' : 'Run installation check'}</button><button type="button" data-installation-action="cancel" ${running ? '' : 'disabled'}>Cancel check</button><button type="button" data-installation-action="download" ${report && !running ? '' : 'disabled'}>Download diagnostic JSON</button>${repair}</div><p role="status" aria-live="polite"><strong>${esc(labels[report?.status] ?? 'Ready')}</strong> · ${esc(summary)}</p>${report ? `<p class="helper">Application ${esc(report.version)} · loaded build ${esc(report.loadedBuild ?? 'unavailable')} · manifest build ${esc(report.manifestBuild ?? 'unavailable')}</p>` : ''}${report?.message ? `<p>${esc(report.message)}</p>` : ''}${running && report?.currentStep ? `<p class="helper">${esc(report.currentStep)}</p>` : ''}<ul class="installation-check-results">${other.map(row).join('')}</ul>${assets.length ? `<details class="installation-assets"><summary>Runtime file checks (${assets.length})</summary><ul class="installation-check-results">${assets.map(row).join('')}</ul></details>` : ''}${report?.environment ? `<p class="helper">Secure connection: ${report.environment.secureContext ? 'yes' : 'no'} · SHA-256: ${report.environment.sha256 ? 'available' : 'unavailable'} · Service Worker API: ${report.environment.serviceWorker ? 'available' : 'unavailable'}. API availability does not establish an installed offline cache.</p>` : ''}</section>`;
}
