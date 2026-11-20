// dsh only: narrate the loop for the research loop view and the Runs tab. Every line restates a value
// the script already holds (a node's structured result or a sagent envelope); nothing is inferred.
const NOTE_LIMIT = 240
const oneLine = (value, limit) => (clip(String(value == null ? '' : value).replace(/\s+/g, ' ').trim(), limit || NOTE_LIMIT) || '')
const hasArtifact = typeof artifact === 'function'
const hasMetric = typeof metric === 'function'
const recordArtifact = (path, description) => { if (hasArtifact && path) artifact(path, description) }
const recordRetrieval = (R, retrieval) => {
  log(`Round ${R.number} reading: ${retrieval.focuses} focus note(s), ${retrieval.passes} pass(es), ${retrieval.enough ? 'enough' : 'not enough'}`)
  recordArtifact(`${R.files.retrieval_dir}/coverage.md`, `round ${R.number} coverage`)
}
// `registered` is register()'s result for the first plan; a revision is narrated only once it is registered.
const recordPlan = (R, plan, experiments, registered) => {
  if (!plan) return
  const failed = registered && !registered.ok && !registered.frozen && experiments.length
  if (failed) log(`Round ${R.number} plan: not registered — ${oneLine(registered.error)}`)
  else {
    const listed = experiments.map((e) => `${e.id} ${JSON.stringify(oneLine(e.title, 120))} [${e.role === 'confirmatory' ? 'confirmatory' : 'exploratory'}]`)
    log(`Round ${R.number} plan: registered · ${listed.join(' · ') || 'no experiments'}`)
  }
  recordArtifact(R.files.round_plan, `round ${R.number} plan`)
}
// A revision replaces the round's plan before any run; experiments it drops were blocked or set aside.
const recordRevision = (R, revised, experiments) => {
  log(`Round ${R.number}: plan revision ${R.revisions} registered after blocked builds`)
  recordPlan(R, revised, experiments)
  for (const dropped of R.dropped.slice(R.droppedLogged || 0)) {
    if (dropped.reason.startsWith('blocked: ')) log(`Round ${R.number} ${dropped.id}: blocked — replaced in plan revision ${R.revisions}: ${oneLine(dropped.reason.slice('blocked: '.length))}`)
    else log(`Round ${R.number}: ${dropped.id} replaced in plan revision ${R.revisions} (${oneLine(dropped.reason)})`)
  }
  R.droppedLogged = R.dropped.length
}
const recordExperiment = (R, e, result) => {
  if (!result) return
  R.validated = (R.validated || 0) + (result.verdict ? 1 : 0)
  R.supported = (R.supported || 0) + (result.verdict === 'supported' ? 1 : 0)
  const runs = (result.run_ids || []).slice(0, 8)
  const tail = `${result.unresolved && result.unresolved.length ? ` · open objections: ${result.unresolved.join(', ')}` : ''}${runs.length ? ` · runs ${runs.join(', ')}` : ''}`
  if (result.verdict) {
    log(`Round ${R.number} ${e.id}: ${result.verdict} (${result.confidence || 'unknown'})${tail}`)
    recordArtifact(`${R.files.validation_dir}/${e.id}.md`, `round ${R.number} validation ${e.id}`)
  } else {
    log(`Round ${R.number} ${e.id}: ${result.status || 'failed'} — ${oneLine(result.reason || 'no reason given')}${tail}`)
  }
}
const recordNext = (R, decision, reason, next) => {
  log(`Round ${R.number} next step: ${decision} — ${oneLine(reason)}`)
  if (next && next.needs_human) log(`Round ${R.number} needs a human: ${oneLine(next.needs_human)}`)
  recordArtifact(R.files.state, `round ${R.number} state of knowledge`)
  recordArtifact(R.files.next_plan, `round ${R.number} next-step plan`)
  if (hasMetric) {
    metric('experiments_validated', R.validated || 0, { step: R.number })
    metric('supported', R.supported || 0, { step: R.number })
  }
}
const recordWriteUp = (R, report, stopped) => {
  log(`Loop stopped: ${stopped.reason}${stopped.detail ? ` — ${oneLine(stopped.detail)}` : ''}`)
  if (report) log(`Write-up: ${oneLine(report.answer, 600)}`)
}
