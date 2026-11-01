---
title: "Workspace model pools for agents"
---


Availability: 0.3.0 development candidate, not a published deployment guarantee. Discover the connected server's tool inventory and inspect the current key before using this workflow. Platform supply pools remain separate administrator resources.

## Authority and discovery

Use `inspect_key` and check `management_capabilities`. Reading, history and preview require `pools:read`; saving requires `pools:write`. An ordinary inference key or a wildcard model grant does not confer management authority. Obtain additional scope through a new explicit browser approval; never request installation credentials.

Use `list_models` to discover concrete model aliases, published customer prices and capabilities. A pool can contain only aliases visible to its workspace and allowed by its managing key. Calls through a pool also require the calling key to permit the selected concrete candidate. A pool cannot expand model grants, create customer prices or expose Provider supply configuration.

## Propose, verify and retain a baseline

1. Establish task requirements, acceptance criteria and a bounded evaluation budget with the user. Retrieve existing execution evidence before commissioning paid comparisons.
2. Use `list_pools` and `get_pool` to retrieve existing policies. Preserve the current configuration and revision as a baseline.
3. Prepare a configuration with a readable workspace-local `slug`, meaningful `name`, `description`, `enabled`, expected `revision`, concrete `candidates`, optional `rules` and `default_action`. Use the generated [REST contract](https://niu.io/docs/api/rest/setworkspacepool/) for exact schemas and bounds. Zero creates; an existing policy requires its current revision.
4. Call `preview_pool` with `configuration` and optional `context` containing the protocol and request traits. It applies the same rule matching, declared-capability filters and priority/weight bands as runtime selection, returning the matched rule, candidate exclusions and selection weights. It does not save, dispatch, validate a complete protocol input, reserve capacity or establish live model access or quality. Missing live qualification remains unknown.
5. Review the intended policy and consequences within the user's delegated authority. Call `set_pool` with `configuration`, then `get_pool` and compare the saved values and returned revision. On a revision conflict, read the latest state and reconcile; do not replay blindly.
6. Only when paid execution is authorized, invoke `pool/<slug>` using a supported inference tool. The returned model remains the selected concrete alias. Customer charges follow that model's ordinary billing path. Pool management and preview themselves do not invoke models.

Candidates use the highest eligible priority and weights within that priority; the existing rule language selects the first matching enabled rule, otherwise the default action applies. Rule candidates must come from the base candidate set. Preview weights describe a distribution, not the next concrete draw; a denominator of zero means no candidate can be selected. Request traits are supplied metadata for policy simulation, not evidence that a complete input will pass admission. This is a configured policy, not an assertion that Niu found the optimal model. No additional automatic cross-model retry is implied.

## Observe and adjust

Use `get_pool_selections` to read the latest 100 selections, including pool revision, concrete model and operation/attempt references when available. `response_status` is the returned HTTP status: a 200 does not prove that a stream completed or an output met the task's acceptance rule. Missing references or status are incomplete evidence, not success or zero cost.

Use `get_generation` with an available attempt reference for execution state, timings, usage and customer charge evidence. Associate task-specific evaluations with their sample, rubric, evaluator and configuration baseline. Compare cost per accepted result only when acceptance criteria and charge coverage are explicit. Never use Provider procurement costs or infer them from customer charges.

Use `get_pool_history` to retrieve prior configurations, following `next_before` when present. To restore a prior policy, submit those configuration values with the current expected revision; history is immutable. Disabling a pool prevents subsequent selection. Preserve historical results when changing policy.

A failed evidence association must not cause replay of an uncertain or possibly paid call. Preserve returned diagnostic references and inspect current state. Continuous sampling, additional tests and automatic policy changes require explicit spending and change authority. Platform event subscriptions and host hooks are separate capabilities; do not invent an undocumented notification mechanism.

## Verification limits

The development checkpoint has PostgreSQL isolation/revision/delegation coverage and local simulated-upstream HTTP coverage for Chat, Responses, Embeddings, Messages and GenerateContent. The expanded HTTP suite also verifies contextual preview rule matching, capability exclusions, default rejection, disabled policies, bounded input rejection and absence of policy persistence. No paid live model execution or task-quality result is established by these fixtures. Final release qualification remains separate.
