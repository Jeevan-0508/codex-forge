const catalogEl = document.querySelector('#catalog');
const searchEl = document.querySelector('#search');
const countEl = document.querySelector('#count');
const portsEl = document.querySelector('#ports-list');
const evidenceSummaryEl = document.querySelector('#evidence-summary');
const evidenceListEl = document.querySelector('#evidence-list');
let projects = [];

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
fetch('ports.json').then((r) => r.json()).then((ports) => {
  portsEl.innerHTML = ports.map((port) => `<article class="card"><div class="badges"><span class="badge class-C">${escapeHtml(port.verification?.real_codex_session === 'passed' ? 'Real Codex verified' : 'Harness verified')}</span><span class="badge">${escapeHtml(port.license)}</span></div><h3>${escapeHtml(port.id)}</h3><p>${escapeHtml(port.summary)}</p><p><b>Source:</b> ${escapeHtml(port.source)}${port.source_skill ? ` · ${escapeHtml(port.source_skill)}` : ''}</p><p><b>Limitations:</b> ${escapeHtml((port.limitations || []).join(' '))}</p></article>`).join('');
}).catch(() => { portsEl.innerHTML = '<p>Verified port metadata unavailable.</p>'; });
fetch('evidence.json').then((r) => r.json()).then((evidence) => {
  const aggregate = evidence.aggregate || {};
  const status = aggregate.conclusion || 'unavailable';
  evidenceSummaryEl.innerHTML = `<p><b>${escapeHtml(status)}</b></p><p>${escapeHtml(evidence.trials_completed || 0)} completed trials · ${escapeHtml(aggregate.improved || 0)} improved · ${escapeHtml(aggregate.tied || 0)} tied · ${escapeHtml(aggregate.regressed || 0)} regressed.</p><p>Runtime compatibility, functional correctness, and quality improvement are separate signals. This page reports deterministic fixture checks only.</p>`;
  evidenceListEl.innerHTML = (evidence.pairs || []).map((pair) => {
    const valid = pair.comparison_status === 'valid-pair';
    const label = !valid ? `Excluded: ${pair.comparison_status}` : pair.score_delta > 0 ? 'Improved' : pair.score_delta < 0 ? 'Regressed' : 'Tied';
    return `<article class="card"><div class="badges"><span class="badge">${escapeHtml(label)}</span><span class="badge">${escapeHtml(pair.skill)}</span></div><h3>${escapeHtml(pair.task)}</h3><p>Baseline <b>${escapeHtml(pair.baseline_score)}/${escapeHtml(pair.max_score)}</b> · Skill-assisted <b>${escapeHtml(pair.assisted_score)}/${escapeHtml(pair.max_score)}</b> · Δ ${escapeHtml(pair.score_delta)}</p><p>${escapeHtml(pair.assisted_skill_read ? 'Skill read confirmed.' : 'Skill read not confirmed.')} Elapsed and token usage are recorded in the published JSON evidence.</p></article>`;
  }).join('');
}).catch(() => { evidenceSummaryEl.textContent = 'Benchmark evidence unavailable.'; evidenceListEl.innerHTML = '<p>Run the local benchmark to publish quality results.</p>'; });
searchEl.addEventListener('input', render);
