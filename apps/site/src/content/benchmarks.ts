// Hypothetical cohorts, not provider measurements or product benchmark results.
// Integer cents cover all 10 runs, including failed runs, repairs and checks.
export const benchmarkExamples = [
  {
    id: "bugfix",
    label: "Fix a bug",
    task: "Fix pagination without breaking filters.",
    checks: "Regression tests + existing test suite",
    explanation:
      "Model B meets the same acceptance bar with less total spend. Model C looks cheap, but six failed runs make it ineligible.",
    models: [
      {
        name: "Model A",
        tier: "Higher token price",
        initial: 1200,
        repair: 400,
        checks: 200,
        accepted: 10,
        slowest: 6,
      },
      {
        name: "Model B",
        tier: "Lower token price",
        initial: 400,
        repair: 160,
        checks: 160,
        accepted: 10,
        slowest: 8,
      },
      {
        name: "Model C",
        tier: "Lowest token price",
        initial: 150,
        repair: 300,
        checks: 150,
        accepted: 4,
        slowest: 9,
      },
    ],
  },
  {
    id: "refactor",
    label: "Refactor code",
    task: "Refactor authentication while preserving behavior.",
    checks: "Authentication contract + existing test suite",
    explanation:
      "Model B needs more repair work. Its lower token price produces a higher cost per accepted result. Keep Model A for this task.",
    models: [
      {
        name: "Model A",
        tier: "Higher token price",
        initial: 1600,
        repair: 400,
        checks: 400,
        accepted: 10,
        slowest: 7,
      },
      {
        name: "Model B",
        tier: "Lower token price",
        initial: 700,
        repair: 2000,
        checks: 600,
        accepted: 10,
        slowest: 10,
      },
      {
        name: "Model C",
        tier: "Lowest token price",
        initial: 180,
        repair: 500,
        checks: 220,
        accepted: 3,
        slowest: 10,
      },
    ],
  },
  {
    id: "edgecase",
    label: "Handle an edge case",
    task: "Make concurrent writes safe against duplicate records.",
    checks: "Concurrency assertions + existing test suite",
    explanation:
      "Model B costs less per accepted result, but misses the required pass rate. Model C has no accepted results, so its cost per success is undefined. Keep Model A.",
    models: [
      {
        name: "Model A",
        tier: "Higher token price",
        initial: 1300,
        repair: 400,
        checks: 300,
        accepted: 10,
        slowest: 8,
      },
      {
        name: "Model B",
        tier: "Lower token price",
        initial: 450,
        repair: 450,
        checks: 300,
        accepted: 8,
        slowest: 9,
      },
      {
        name: "Model C",
        tier: "Lowest token price",
        initial: 100,
        repair: 400,
        checks: 200,
        accepted: 0,
        slowest: 10,
      },
    ],
  },
];
export const totalCents = (
  model: (typeof benchmarkExamples)[number]["models"][number],
) => model.initial + model.repair + model.checks;
export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
