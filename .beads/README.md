# Niu work tracking

Use Beads (`bd`) for task coordination and review follow-up. Read
[the repository workflow](../docs/development/beads.md) for setup, claims,
review evidence, acceptance, synchronization and handoff.

Dolt is the live source of truth. `issues.jsonl` is an issue-level export for
review and reconstruction, not a full database backup or collaboration transport.
Refresh it with `python3 scripts/beads-snapshot.py` after task changes.
