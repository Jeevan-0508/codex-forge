const catalogEl = document.querySelector('#catalog');
const searchEl = document.querySelector('#search');
const countEl = document.querySelector('#count');
const portsEl = document.querySelector('#ports-list');
const evidenceSummaryEl = document.querySelector('#evidence-summary');
const evidenceListEl = document.querySelector('#evidence-list');
const portSearchEl = document.querySelector('#port-search');
const capabilityEl = document.querySelector('#capability-filter');
const verificationEl = document.querySelector('#verification-filter');
const licenseEl = document.querySelector('#license-filter');
const osEl = document.querySelector('#os-filter');
const difficultyEl = document.querySelector('#difficulty-filter');
let projects = [];
let ports = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function card(project) {
  const c = project.compatibility || {};
  return `<article class="card"><div class="badges"><span class="badge class-${c.class || 'F'}">Class ${c.class || 'F'} · ${c.label || 'Unverified'}</span><span class="badge">${project.license || 'Unknown license'}</span></div><h3><a href="${project.url}">${project.repository}</a></h3><p>${project.description || 'No description recorded.'}</p><p><b>${project.stars?.toLocaleString() || 0}</b> stars · ${project.conversion_difficulty || 'unknown'} conversion · <br>${project.verification_status || 'unverified'}</p></article>`;
}
function render() {
  const q = searchEl.value.trim().toLowerCase();
  const visible = projects.filter((p) => !q || JSON.stringify(p).toLowerCase().includes(q));
  catalogEl.innerHTML = visible.length ? visible.map(card).join('') : '<p>No evidence-backed catalog matches.</p>';
}
fetch('catalog.json').then((r) => r.json()).then((data) => { projects = data; countEl.textContent = data.length; render(); }).catch(() => { catalogEl.innerHTML = '<p>Catalog unavailable. Use the local CLI or GitHub repository.</p>'; });
function options(select, values) { select.innerHTML = `<option value="">${escapeHtml(select.options[0]?.textContent || 'All')}</option>` + [...new Set(values.flat())].sort().map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join(''); }
function renderPorts() {
  const q = portSearchEl.value.trim().toLowerCase();
  const visible = ports.filter((port) => {
    const text = JSON.stringify(port).toLowerCase();
    return (!q || text.includes(q)) && (!capabilityEl.value || (port.capabilities || []).includes(capabilityEl.value)) && (!verificationEl.value || port.status === verificationEl.value) && (!licenseEl.value || port.license === licenseEl.value) && (!osEl.value || (port.supported_os || []).includes(osEl.value)) && (!difficultyEl.value || port.install_difficulty === difficultyEl.value);
  });
  portsEl.innerHTML = visible.length ? visible.map((port) => `<article class="card"><div class="badges"><span class="badge class-C">${escapeHtml(port.verification?.real_codex_session === 'passed' ? 'Real Codex verified' : port.verification?.harness === 'passed' ? 'Harness verified' : 'Unverified')}</span><span class="badge">${escapeHtml(port.license || 'Unknown')}</span><span class="badge">${escapeHtml(port.install_difficulty || 'unknown')} install</span></div><h3>${escapeHtml(port.id)}</h3><p>${escapeHtml(port.summary)}</p><p><b>Capabilities:</b> ${escapeHtml((port.capabilities || []).join(', '))}</p><p><b>OS:</b> ${escapeHtml((port.supported_os || []).join(', '))} · <b>Dependencies:</b> ${escapeHtml((port.dependencies || []).length ? port.dependencies.join(', ') : 'none')} · <b>Codex:</b> ${escapeHtml(port.last_verified_codex || 'unknown')}</p><p><b>Example:</b> ${escapeHtml((port.examples || [])[0] || '—')}</p><p><b>Install:</b> <code>${escapeHtml(port.install_command || `codex-forge port install ${port.id}`)}</code></p><p><b>Source:</b> ${escapeHtml(port.source)}${port.source_skill ? ` · ${escapeHtml(port.source_skill)}` : ''}</p><p><b>Limitations:</b> ${escapeHtml((port.limitations || []).join(' ') || 'None recorded.')}</p></article>`).join('') : '<p>No ports match these filters.</p>';
}
fetch('ports.json').then((r) => r.json()).then((data) => {
  ports = data; options(capabilityEl, ports.map((port) => port.capabilities || [])); options(verificationEl, ports.map((port) => [port.status])); options(licenseEl, ports.map((port) => [port.license])); options(osEl, ports.map((port) => port.supported_os || [])); options(difficultyEl, ports.map((port) => [port.install_difficulty])); renderPorts();
}).catch(() => { portsEl.innerHTML = '<p>Verified port metadata unavailable.</p>'; });
fetch('evidence.json').then((r) => r.json()).then((evidence) => {
  const aggregate = evidence.aggregate || {};
  const status = aggregate.conclusion || 'unavailable';
  const timeouts = (evidence.trials || []).filter((trial) => trial.timed_out).length;
  const repetitions = evidence.repetitions_requested || 1;
  const performance = aggregate.comparable_performance || {};
  const resultPath = evidence.benchmark?.includes('phase-7') ? 'benchmarks/results/phase-7-latest.json' : evidence.mode === 'full' || evidence.benchmark?.includes('phase-6') ? 'benchmarks/results/phase-6-latest.json' : 'benchmarks/results/phase-5-latest.json';
  const phase6Link = evidence.benchmark?.includes('phase-7') ? ' · <a href="phase-6-evidence.json">Phase 6 evidence preserved</a>' : '';
  evidenceSummaryEl.innerHTML = `<p><b>${escapeHtml(status)}</b></p><p>${escapeHtml(evidence.trials_completed || 0)} completed trials · ${escapeHtml(repetitions)} repetition(s) · ${escapeHtml(aggregate.comparable_pairs || 0)} valid pairs · ${escapeHtml(aggregate.invalid_pairs || 0)} invalid pairs.</p><p>${escapeHtml(aggregate.improved || 0)} improved · ${escapeHtml(aggregate.tied || 0)} tied · ${escapeHtml(aggregate.regressed || 0)} regressed · ${escapeHtml(timeouts)} timed out.</p><p>Comparable latency: ${escapeHtml(performance.baseline_elapsed_ms || '—')}ms baseline vs ${escapeHtml(performance.assisted_elapsed_ms || '—')}ms assisted. Output tokens: ${escapeHtml(performance.baseline_output_tokens || '—')} vs ${escapeHtml(performance.assisted_output_tokens || '—')}.</p><p>Runtime compatibility, functional correctness, and quality improvement are separate signals. <a href="https://github.com/Jeevan-0508/codex-forge/blob/main/benchmarks/README.md">Methodology</a> · <a href="https://github.com/Jeevan-0508/codex-forge/blob/main/${resultPath}">Raw evidence</a>${phase6Link}.</p>`;
  evidenceListEl.innerHTML = (evidence.pairs || []).map((pair) => {
    const valid = pair.comparison_status === 'valid-pair';
    const label = !valid ? `Excluded: ${pair.comparison_status}` : pair.score_delta > 0 ? 'Improved' : pair.score_delta < 0 ? 'Regressed' : 'Tied';
    return `<article class="card"><div class="badges"><span class="badge">${escapeHtml(label)}</span><span class="badge">${escapeHtml(pair.skill)}</span></div><h3>${escapeHtml(pair.task)}</h3><p>Baseline <b>${escapeHtml(pair.baseline_score)}/${escapeHtml(pair.max_score)}</b> · Skill-assisted <b>${escapeHtml(pair.assisted_score)}/${escapeHtml(pair.max_score)}</b> · Δ ${escapeHtml(pair.score_delta)}</p><p>${escapeHtml(pair.assisted_skill_read === false ? 'Skill read not confirmed.' : 'Skill activation confirmed by the trial.')} Elapsed and token usage are recorded in the published JSON evidence.</p></article>`;
  }).join('');
}).catch(() => { evidenceSummaryEl.textContent = 'Benchmark evidence unavailable.'; evidenceListEl.innerHTML = '<p>Run the local benchmark to publish quality results.</p>'; });
searchEl.addEventListener('input', render);
[portSearchEl, capabilityEl, verificationEl, licenseEl, osEl, difficultyEl].forEach((element) => element.addEventListener('input', renderPorts));
