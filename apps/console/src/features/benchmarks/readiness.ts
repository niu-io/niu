type DatasetObject = Record<string, unknown>;

const object = (value: unknown): DatasetObject | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as DatasetObject
    : null;

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validHash = (value: unknown): boolean =>
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

/** Give users a short, local checklist of required paired-evaluation evidence. */
export function missingPairedEvidence(value: unknown): string[] {
  const missing = new Set<string>();
  const dataset = object(value);
  if (!dataset) return ["A valid paired dataset"];

  if (dataset.mode !== "paired_experiment" || dataset.opt_in !== true || !nonEmpty(dataset.authorization_ref)) {
    missing.add("Explicit approval for a paired comparison");
  }

  const tasks = Array.isArray(dataset.tasks) ? dataset.tasks.map(object) : [];
  const taskIds = tasks.map(task => task?.id).filter(nonEmpty);
  if (tasks.length === 0 || tasks.length !== taskIds.length || new Set(taskIds).size !== taskIds.length || tasks.some(task =>
    !task || !nonEmpty(task.id) || !validHash(task.snapshot_sha256) || !validHash(task.tools_sha256) ||
    !validHash(task.permissions_sha256) || !validHash(task.acceptance_sha256))) {
    missing.add("Task snapshots with matching tool, permission, and acceptance hashes");
  }

  const candidates = Array.isArray(dataset.candidates) ? dataset.candidates.map(object) : [];
  const candidateIds = candidates.map(candidate => candidate?.id).filter(nonEmpty);
  const candidatesReady = candidates.length === 2 && candidateIds.length === 2 && new Set(candidateIds).size === 2 &&
    candidates.every(candidate => candidate && nonEmpty(candidate.id) && nonEmpty(candidate.model_alias) && nonEmpty(candidate.offer_revision));
  if (!candidatesReady) missing.add("Two distinct candidates with pinned model route revisions");

  const repetitions = dataset.repetitions;
  const trials = Array.isArray(dataset.trials) ? dataset.trials.map(object) : [];
  const taskIdSet = new Set(taskIds);
  const candidateById = new Map(candidates.filter((candidate): candidate is DatasetObject => candidate !== null)
    .filter(candidate => nonEmpty(candidate.id)).map(candidate => [candidate.id, candidate]));
  const expectedCount = Number.isInteger(repetitions) && Number(repetitions) > 0 && Number(repetitions) <= 100
    ? taskIds.length * candidates.length * Number(repetitions)
    : -1;
  const seenPairs = new Set<string>();
  const seenAttemptIds = new Set<string>();
  if (expectedCount < 0 || trials.length !== expectedCount) missing.add("One run for every task, candidate, and repetition");

  for (const trial of trials) {
    if (!trial) {
      missing.add("One run for every task, candidate, and repetition");
      continue;
    }
    const taskId = trial.task_snapshot_id;
    const candidateId = trial.candidate_id;
    const repetition = trial.repetition;
    const candidate = nonEmpty(candidateId) ? candidateById.get(candidateId) : undefined;
    if (!nonEmpty(taskId) || !taskIdSet.has(taskId) || !candidate || !Number.isInteger(repetition) ||
      Number(repetition) < 1 || Number(repetition) > Number(repetitions)) {
      missing.add("One run for every task, candidate, and repetition");
    } else {
      const key = `${taskId}\u0000${candidateId}\u0000${repetition}`;
      if (seenPairs.has(key)) missing.add("One run for every task, candidate, and repetition");
      seenPairs.add(key);
    }

    const execution = object(trial.execution);
    if (execution?.coverage !== "complete") missing.add("Complete execution coverage for every run");
    const outcomes = Array.isArray(execution?.outcomes) ? execution.outcomes.map(object) : [];
    const spans = Array.isArray(execution?.spans) ? execution.spans.map(object) : [];
    const spanIds = new Set(spans.map(span => span?.id).filter(nonEmpty));
    const trustedOutcomes = outcomes.filter(outcome =>
      outcome?.authority === "deterministic_validator" || outcome?.authority === "human_acceptance");
    const conflictingOutcome = ["deterministic_validator", "human_acceptance"].some(authority => {
      const results = new Set(trustedOutcomes.filter(outcome => outcome?.authority === authority).map(outcome => outcome?.result));
      return results.size > 1;
    });
    if (conflictingOutcome || !outcomes.some(outcome =>
      (outcome?.authority === "deterministic_validator" || outcome?.authority === "human_acceptance") &&
      (outcome?.result === "accepted" || outcome?.result === "rejected") &&
      nonEmpty(outcome.span_id) && spanIds.has(outcome.span_id) && nonEmpty(outcome.evidence_id)) ||
      !Number.isInteger(trial.quality_basis_points) || Number(trial.quality_basis_points) < 0 || Number(trial.quality_basis_points) > 10_000) {
      missing.add("A non-conflicting validator or human outcome and quality score for every run");
    }

    if (!candidate || trial.offer_revision !== candidate.offer_revision ||
      !spans.some(span => span?.kind === "model_invocation" && span.requested_model === candidate.model_alias)) {
      missing.add("A matching model invocation on the pinned route revision for every run");
    }

    const costs = object(trial.costs);
    const attempts = Array.isArray(trial.gateway_attempts) ? trial.gateway_attempts.map(object) : [];
    const attemptIds = attempts.map(attempt => attempt?.attempt_id).filter(nonEmpty);
    const chargeRefs = spans.map(span => span?.charge_ref).filter(nonEmpty);
    if (costs?.complete !== true || !nonEmpty(costs.currency) || attempts.length === 0 ||
      attempts.length !== attemptIds.length || new Set(attemptIds).size !== attemptIds.length ||
      attemptIds.some(id => seenAttemptIds.has(id)) ||
      chargeRefs.length === 0 || chargeRefs.some(reference => !attemptIds.includes(reference)) ||
      attempts.some(attempt => !attempt || !nonEmpty(attempt.currency) || !nonEmpty(attempt.cash_nanos) || !nonEmpty(attempt.api_equivalent_nanos))) {
      missing.add("Settled Gateway charges for every billable span");
    }
    attemptIds.forEach(id => seenAttemptIds.add(id));
  }

  return [...missing];
}
