/**
 * Your ReadyTalent applications (from the My Applications page) turned into marks on your saved state.
 * Only adds marks: a mark you set yourself is never removed. ReadyTalent's own status text is kept per job
 * in `appStatus`. Pure: returns the new state (or null when nothing changed) and the counts.
 */
const REJECTED = /unsuccess|reject|not selected|regret/i;

function applyApplications(state, apps) {
  if (!state || !apps.length) return { state: null, markedApplied: 0, markedRejected: 0 };
  const s = { ...state, applied: { ...(state.applied || {}) }, rejected: { ...(state.rejected || {}) }, appStatus: { ...(state.appStatus || {}) } };
  const now = new Date().toISOString();
  let markedApplied = 0, markedRejected = 0, changed = false;
  for (const a of apps) {
    if (!s.applied[a.jobId]) { s.applied[a.jobId] = /^\d{4}-\d{2}-\d{2}/.test(a.appliedAt || "") ? a.appliedAt : now; markedApplied++; }
    if (REJECTED.test(a.status || "") && !s.rejected[a.jobId]) { s.rejected[a.jobId] = now; markedRejected++; }
    if (a.status && s.appStatus[a.jobId] !== a.status) { s.appStatus[a.jobId] = a.status; changed = true; }
  }
  if (!markedApplied && !markedRejected && !changed) return { state: null, markedApplied, markedRejected };
  s._rev = (Number(s._rev) || 0) + 1; // newer than every open tab's copy, so they reload it
  return { state: s, markedApplied, markedRejected };
}

module.exports = { applyApplications, REJECTED };
