const RESTRICTED_LICENSES = new Set(['NOASSERTION', 'UNKNOWN', '', null]);

export function analyzeCompatibility(project) {
  const reasons = [];
  if (RESTRICTED_LICENSES.has(project.license)) reasons.push('license evidence is missing or unresolved');
  if (project.claude_dependencies?.length) reasons.push(...project.claude_dependencies.map((item) => `dependency: ${item}`));
  if (project.verification_status?.includes('runtime-unverified')) reasons.push('runtime behavior has not been verified in Codex');
  return {
    class: project.compatibility?.class || 'F',
    label: project.compatibility?.label || 'Unverified or unsafe',
    confidence: project.compatibility?.confidence || 'unknown',
    reasons,
    redistribution_allowed: !RESTRICTED_LICENSES.has(project.license),
    runtime_verified: project.verification_status === 'runtime-verified'
  };
}
