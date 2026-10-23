# Account funding task validation

Prepared 2026-10-23 for UX-22, Beads `niu-lxs.23`, GitHub #103. This is a test protocol, not a completed study or a second task backlog. Implementation and expert walkthrough evidence are in [remediation.md](remediation.md).

## Purpose and evidence boundary

Determine whether a customer can discover who owns shared funds, recover from insufficient credit, understand a payment's outcome and resume their original task without knowing Niu's navigation labels. Automated tests establish route, permission and settlement behavior; they do not establish that customers understand those concepts.

Use a target customer who has not implemented the interface. An owner walkthrough by the product owner can provide useful acceptance feedback, but record their prior knowledge rather than describing them as an independent first-time customer. Do not use an AI simulation as participant evidence.

## Facilitator preparation

Use an isolated development installation with mock payments and disposable accounts. Do not enter real payment details or make paid inference calls. Disable or omit real upstream credentials. Prepare two workspaces sharing one customer account, a separate unrelated customer account, and owner/member identities with their actual supported permissions. Prepare pending, paid, failed and uncertain orders using the mock service or controlled test fixtures; do not change production records.

Start each task at the stated surface. Do not open the destination for the participant. Use the product's current desktop layout and one narrow layout. Explain only that the payment service is simulated and that no real payment should be attempted. Keep route names, sidebar names and expected steps out of the participant prompts.

Record the tested revision and relevant working-tree changes, viewport, participant role and prior familiarity. Record observations with consent; do not place identities, credentials, payment details or raw recordings in the public repository. Public evidence should be anonymized and limited to necessary observations.

## Participant tasks

Present one prompt at a time. Ask the participant to explain their reasoning. Do not hint at a page or button name.

| Starting condition | Prompt | Observable outcome |
| --- | --- | --- |
| Owner viewing workspace spending, insufficient available credit | “You want to continue using this workspace. Make enough test funds available, then return to what you were doing.” | Finds funding without a navigation hint; understands the shared account; completes a simulated top-up; returns to the originating workspace. |
| Owner viewing one of two workspaces sharing an account | “If you add funds here, who can use them? Show where you would check what this workspace has spent.” | Distinguishes shared available funds from workspace charges/limits and does not assume a separate balance for every workspace. |
| Pending order after leaving simulated checkout | “You started adding funds but are unsure whether it finished. Find out what happened and decide what to do next.” | Reopens the original order, recognizes pending status and uses its recovery action without blindly creating a duplicate. |
| Failed or uncertain order | “The funds have not appeared. Work out what is known and your next step.” | Distinguishes confirmed failure from an unknown outcome; does not equate returning from checkout with payment success. |
| Paid order, after a fresh sign-in | “Find the payment you made and confirm whether the funds were received.” | Finds persistent order history and the shared funds result; distinguishes payment history from consumption activity. |
| Member without funding permission, insufficient credit | “You cannot continue because funds are unavailable. Find out who can help and what to ask them to do.” | Understands the owner handoff; is not invited to configure merchant credentials or access another customer's funds. |

Repeat a recovery task at the narrow viewport. Observe menu/dialog use, ability to see the current state, dismissal and return to the original task. Avoid repeating an already learned discovery task and treating the second attempt as independent first-use evidence.

## Observation and decision

For each task record the actual path, first interpretation, requests for help, mistaken destinations, outcome, and whether assistance was needed. Record elapsed time as context, not an invented universal pass threshold. Ask neutral follow-ups such as “What do you expect to happen?” rather than teaching the intended model during the task.

A navigation hint or explanation of shared ownership makes that attempt assisted. Any material misunderstanding of whose funds are used, duplicate-payment risk, unavailable funding authority, or paid versus uncertain status fails the relevant acceptance branch even if the participant eventually reaches the destination. Reopen or update the existing finding with the observed trigger and impact; repair and retest that branch.

An unassisted successful attempt supports this bounded task for the tested role and conditions. It does not prove universal usability or live merchant qualification. Publish a dated, anonymized observation summary linked from the bead only after a human has performed the tasks. Until then, the actual-user acceptance remains unverified.
