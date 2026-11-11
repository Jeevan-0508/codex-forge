const API = 'https://api.github.com';

export function buildSearchUrl(query, page = 1, perPage = 30) {
  const params = new URLSearchParams({ q: query, page: String(page), per_page: String(Math.min(perPage, 100)) });
  return `${API}/search/repositories?${params}`;
}

export async function discoverRepositories({ query, pages = 1, perPage = 30, token, fetchImpl = fetch } = {}) {
  if (!query) throw new Error('query is required');
  const results = [];
  for (let page = 1; page <= pages; page += 1) {
    const response = await fetchImpl(buildSearchUrl(query, page, perPage), {
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
    if (!response.ok) throw new Error(`GitHub discovery failed: HTTP ${response.status}`);
    const body = await response.json();
    for (const item of body.items || []) {
      results.push({
        repository: item.full_name,
        url: item.html_url,
        description: item.description || '',
        license: item.license?.spdx_id || 'UNKNOWN',
        stars: item.stargazers_count || 0,
        last_updated: item.updated_at || null,
        source: 'GitHub repository search'
      });
    }
    if (!body.items?.length || results.length >= (body.total_count || 0)) break;
  }
  return results;
}
