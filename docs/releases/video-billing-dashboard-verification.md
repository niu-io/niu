# Video Billing dashboard checkpoint

Reviewed 2026-10-07. Rendered historical customer explanation subset; live
video and complete release acceptance remain open.

Video's Billing tab shows posted customer charge, a nonzero active reservation,
original estimate, reported or settled quantity, and saved output specification.
Posted settlement quantities take precedence over later usage observations;
reconciliation warnings remain visible. Pending charges stay unknown, qualified
zero charges remain zero, and owner-funded use has no invented customer bill.

Charge calculation uses the installed Collapsible and Button primitives. Its
expanded details show the original customer rate and denominator, settled
billable quantity, applicable minimum, applied discount multipliers and rounding.
No internal revision identifiers, Supplier purchase rates or procurement fields
are displayed. Currency, quantities and amounts retain exact string/BigInt
arithmetic rather than a floating-point conversion. No new Billing backend or
browser persistence was introduced.

Verification:

- Fifty affected Video/Chat tests passed, including exact large quantities and
  prices, conflicts, pending liability, owner-funded use and qualified zero.
- Dashboard type checking, public-boundary and scoped whitespace checks passed.
- OpenRouter's actual model Pricing page was inspected for customer rate/unit
  presentation, then adapted to Niu's existing Billing tab and shared surfaces.
- The production billing component was reviewed collapsed and expanded at
  desktop and 390-pixel narrow widths in an isolated fixture. Long exact values
  wrap; content width matches the viewport. The disclosure has a visible arrow
  and retains its accessible open state. Temporary review files were removed.

No live Supplier video or synthetic production job was created. A real qualified
job must still be traced from generation through Logs/Usage/global account Billing
and historical reconciliation, including packaged restart/upgrade. This evidence
does not close V13/V16/M08 or any F01–F10 gate.
