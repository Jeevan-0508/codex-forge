const catalogEl = document.querySelector('#catalog');
const searchEl = document.querySelector('#search');
const countEl = document.querySelector('#count');
const portsEl = document.querySelector('#ports-list');
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
searchEl.addEventListener('input', render);
