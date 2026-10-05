/* AI-ready extension points — architectural seams, with a hard safety boundary.
 *
 * WHAT THIS IS FOR
 * The product benefits from AI for: generating candidate fresh situations,
 * alternative examples, personalised explanations, and practice coaching.
 *
 * THE BOUNDARY (non-negotiable, and enforced here)
 *   1. AI may never grade, judge a criterion, derive an outcome, or write an
 *      essential criterion. The deterministic engine (evidence.js derive) is the
 *      ONLY thing that can turn judgements into an outcome.
 *   2. AI assistance is always recorded as solving help. A run that used AI can
 *      never silently become independent evidence: the app already records
 *      help_used, and anything produced through these hooks is offered only as
 *      practice or as a draft explanation, never as the learner's own answer.
 *   3. Every AI-produced artefact is clearly labelled as AI-assisted and is not
 *      persisted into the learner's evidence state.
 *   4. All derivation stays inspectable and offline-capable. With no AI adapter
 *      installed, the whole product still works exactly as before.
 *
 * This module defines the interface and the guardrails. It deliberately ships
 * with NO provider, NO key handling and NO network call. A deployment may plug
 * in an adapter; a static, offline, dependency-free install simply has none,
 * and the adapter-presence check keeps the boundary honest.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIBoundary = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* The only capability an AI adapter may advertise. Anything a provider cannot
   * honour is simply not offered. There is deliberately no 'grade' capability. */
  const ALLOWED = Object.freeze(['draft_situation', 'alternative_example', 'draft_explanation', 'coach_practice']);

  // Any task an AI produces is practice or explanation - never the learner's
  // own submission, and never evidence.
  const AI_RESULT_ROLE = Object.freeze({ ALWAYS: 'ai-assisted-draft' });

  /* Strip anything that could be mistaken for a learner's own answer. A
   * generated explanation must not be able to pre-fill the response box. */
  function asDraft(result) {
    return Object.freeze({
      role: AI_RESULT_ROLE.ALWAYS,
      counts_as_evidence: false,
      counts_as_solving_help: true,
      assist_learner: true,
      content: result && typeof result.content === 'string' ? result.content : '',
      warnings: Array.isArray(result && result.warnings) ? result.warnings.slice() : []
    });
  }

  /* Validate a proposed adapter. Returns the safe subset it may actually use.
   * An adapter that tries to grade or persist is neutralised, not trusted. */
  function sanitiseAdapter(adapter) {
    const use = {};
    for (const cap of ALLOWED) {
      if (adapter && typeof adapter[cap] === 'function') {
        use[cap] = async (input) => asDraft(await adapter[cap](input));
      }
    }
    // Even if an adapter exposes something like 'grade', it is never surfaced.
    return Object.freeze(use);
  }

  /* Coerce any AI-derived text into a record that is always treated as help.
   * The engine's recordAttempt already derives outcome from judgements; this
   * only guarantees the help flag is set if an AI artefact ever influenced the
   * flow. It cannot produce evidence on its own. */
  function helpIfAIUsed(attemptInput, usedAI) {
    if (!usedAI) return attemptInput;
    return { ...attemptInput, help_used: true, ai_assisted: true };
  }

  function isAvailable(adapter) {
    return !!adapter && ALLOWED.some(c => typeof adapter[c] === 'function');
  }

  return { ALLOWED, AI_RESULT_ROLE, asDraft, sanitiseAdapter, helpIfAIUsed, isAvailable };
});