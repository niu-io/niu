import userEvent from "@testing-library/user-event";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  MemoryRouter,
  Route,
  Routes,
} from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import AgentReviewPage from "@/features/agent-review/page";
import { clearSessionCache } from "@/lib/query-cache";
const { context } = vi.hoisted(() => ({
  context: {
    token: "member-fixture",
    workspace: { id: "11111111-1111-4111-8111-111111111111" },
  },
}));
vi.mock("@/shell/dashboard-context", () => ({
  useDashboardContext: () => context,
}));

afterEach(() => {
  cleanup();
  clearSessionCache();
  vi.unstubAllGlobals();
  context.workspace.id = "11111111-1111-4111-8111-111111111111";
});
function page(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/workspaces/:workspace/routing"
          element={<AgentReviewPage />}
        />
        <Route
          path="/workspaces/:workspace/routing/:slug"
          element={<AgentReviewPage />}
        />
        <Route
          path="/workspaces/:workspace/evaluations/:slug/runs/:run"
          element={<AgentReviewPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}
test('the agent handoff identifies the current deployment and workspace', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data: [], next_after: null})));
  const user = userEvent.setup();
  render(page('/workspaces/demo/routing'));
  await user.click(await screen.findByRole('button', {name: 'Copy agent prompt'}));
  const prompt = await navigator.clipboard.readText();
  expect(prompt).toContain(`deployment at ${window.location.origin}`);
  expect(prompt).toContain(`${window.location.origin}/workspaces/demo`);
  expect(prompt).not.toContain(context.workspace.id);
  expect(prompt).toContain('Verify the deployment and workspace during authorization');
});
test("evaluation review preserves unknown charges and does not display internal identifiers", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const summary = {
    samples: 1,
    verified_inputs: 1,
    unverified_inputs: 0,
    verdicts: { accepted: 1 },
    attempts: 1,
    unknown_charge_attempts: 1,
    customer_charge_totals: [],
    cost_per_accepted: null,
    cost_per_accepted_basis: "all_attempts_in_submitted_operations",
    duration_basis: "evaluated_attempt_only",
  };
  const receipt = {
    slug: "candidate",
    name: "Candidate",
    evaluation: "notes",
    evaluation_revision: 1,
    definition: {
      task: "Summarize decisions",
      rubric: "All owners must be correct",
    },
    evaluator: { name: "Task check", version: "1", kind: "check" },
    submitter: { key_id: id },
    capture: { finished_at: "2026-10-31T00:00:00Z" },
    summary,
    results: [
      {
        sample: "meeting",
        input_match: "verified",
        pool_selections: [{slug:id,revision:1,selected_model:"fast"}],
        evaluated_attempt_id: id,
        operation_id: id,
        judgment: { verdict: "accepted", reason: "All owners match" },
        duration_ms: 123,
        attempts: [
          {
            attempt_id: id,
            model: "fast",
            customer_charge: { status: "owner_funded", amount_nanos: null },
          },
        ],
      },
    ],
  };
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return Response.json(
        String(url).endsWith("/runs/candidate")
          ? receipt
          : String(url).endsWith("/runs")
            ? { data: [], next_after: null }
            : { slug: "notes", name: "Notes", revision: 1 },
      );
    }),
  );
  render(page("/workspaces/demo/evaluations/notes/runs/candidate"));
  expect(
    await screen.findByRole("heading", { name: "Candidate" }),
  ).toBeTruthy();
  expect(
    screen.getByText("Insufficient comparable charge evidence"),
  ).toBeTruthy();
  expect(screen.getByText("1 of 1 attempts have unknown charges")).toBeTruthy();
  expect(document.body.textContent).not.toContain(id);
  expect(
    calls.every((url) =>
      url.includes("/api/v1/workspaces/11111111-1111-4111-8111-111111111111/"),
    ),
  ).toBe(true);
});
test("switching workspace clears prior resource rows before the new response arrives", async () => {
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      String(url).includes("11111111-1111-4111-8111-111111111111")
        ? Promise.resolve(
            Response.json({
              data: [
                {
                  slug: "first-pool",
                  name: "First workspace policy",
                  revision: 1,
                  enabled: true,
                  candidates: [],
                },
              ],
              next_after: null,
            }),
          )
        : new Promise<Response>((resolve) => {
            finish = resolve;
          }),
    ),
  );
  const view = render(page("/workspaces/demo/routing"));
  expect(await screen.findByText("First workspace policy")).toBeTruthy();
  context.workspace.id = "33333333-3333-4333-8333-333333333333";
  view.rerender(page("/workspaces/demo/routing"));
  expect(screen.queryByText("First workspace policy")).toBeNull();
  expect(screen.getByRole("status").textContent).toMatch(/Loading/);
  await waitFor(() => expect(finish).toBeTruthy());
  finish!(Response.json({ data: [], next_after: null }));
  expect(
    await screen.findByRole("heading", { name: "No routing rules yet" }),
  ).toBeTruthy();
});
test("permission failure does not masquerade as empty or saved configuration", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ error: { message: "Forbidden" } }, { status: 403 }),
    ),
  );
  render(page("/workspaces/demo/routing"));
  expect(
    await screen.findByText(
      "Your current membership cannot read this workspace.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText("No routing rules yet")).toBeNull();
  expect(screen.queryByText(/Saved workspace configuration/)).toBeNull();
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
});

test("historical pool review shows the saved configuration and returns keyboard focus", async () => {
  const current = {
    slug: "assistant",
    name: "Assistant",
    revision: 2,
    description: "Current policy",
    enabled: true,
    default_action: "candidates",
    candidates: [{ alias: "fast", enabled: true, priority: 100, weight: 2000 }],
    rules: [],
  };
  const earlier = {
    ...current,
    revision: 1,
    description: "Earlier policy",
    candidates: [{ alias: "fast", enabled: true, priority: 100, weight: 1000 }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        String(url).includes("/history")
          ? { data: [earlier], next_before: null }
          : String(url).includes("/selections")
            ? { data: [] }
            : { data: current },
      ),
    ),
  );
  render(page("/workspaces/demo/routing/assistant?tab=history"));
  const opener = await screen.findByRole("button", {
    name: "Review revision 1",
  });
  const user = userEvent.setup();
  await user.click(opener);
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("Earlier policy");
  expect(dialog.textContent).not.toContain("Current policy");
  expect(dialog.textContent).toContain("Candidate models");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(opener);
});

test("history navigation restores baseline and discards an obsolete comparison response", async () => {
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (String(url).includes("/compare?"))
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      if (String(url).endsWith("/runs"))
        return Promise.resolve(
          Response.json({
            data: [
              { slug: "first", name: "First baseline" },
              { slug: "second", name: "Second baseline" },
            ],
            next_after: null,
          }),
        );
      if (String(url).endsWith("/runs/candidate"))
        return Promise.resolve(
          Response.json({
            slug: "candidate",
            name: "Candidate",
            definition: { task: "Fixture task", rubric: "Fixture rubric" },
            evaluation_revision: 1,
            evaluator: { name: "Fixture", version: "1", kind: "check" },
            capture: { finished_at: "2026-10-31T00:00:00Z" },
            results: [],
          }),
        );
      return Promise.resolve(
        Response.json({ slug: "notes", name: "Notes", revision: 1 }),
      );
    }),
  );
  const route =
    "/workspaces/demo/evaluations/notes/runs/candidate?tab=comparison&baseline=";
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:workspace/evaluations/:slug/runs/:run",
        element: <AgentReviewPage />,
      },
    ],
    { initialEntries: [route + "first", route + "second"], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  expect(
    await screen.findByRole("button", { name: "Second baseline" }),
  ).toBeTruthy();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Compare matched samples" }));
  await waitFor(() => expect(finish).toBeTruthy());
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByRole("button", { name: "First baseline" })).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Compare matched samples" })
      .hasAttribute("disabled"),
  ).toBe(false);
  await act(async () => {
    finish!(Response.json({ matched_verified_samples: 999 }));
  });
  expect(screen.queryByText(/999 verified/)).toBeNull();
});

test("evaluation policy reference opens its captured revision beyond the latest history page", async () => {
  const current = {
    slug: "assistant",
    name: "Current policy name",
    description: "Current configuration",
    revision: 103,
    enabled: false,
    candidates: [],
    rules: [],
    default_action: "candidates",
  };
  const captured = {
    ...current,
    name: "Captured policy name",
    description: "Captured configuration",
    revision: 1,
  };
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      calls.push(path);
      if (path.includes("/routing/assistant/history"))
        return Response.json({
          data: path.includes("before=2") ? [captured] : [current],
          next_before: null,
        });
      if (path.includes("/routing/assistant/selections"))
        return Response.json({ data: [] });
      if (path.endsWith("/routing/assistant"))
        return Response.json({ data: current });
      if (path.endsWith("/runs/candidate"))
        return Response.json({
          slug: "candidate",
          name: "Candidate",
          evaluation_revision: 1,
          definition: { task: "Fixture task", rubric: "Fixture rubric" },
          evaluator: { kind: "check", name: "Fixture", version: "1" },
          capture: { finished_at: "2026-10-31T00:00:00Z" },
          summary: {
            samples: 1,
            verified_inputs: 1,
            unverified_inputs: 0,
            verdicts: { accepted: 1 },
            attempts: 1,
            unknown_charge_attempts: 1,
            customer_charge_totals: [],
            cost_per_accepted: null,
          },
          results: [
            {
              sample: "meeting",
              input_match: "verified",
              judgment: { verdict: "accepted", reason: "Fixture" },
              duration_ms: 12,
              evaluated_attempt_id: "fixture-attempt",
              attempts: [{ attempt_id: "fixture-attempt", model: "fast" }],
              pool_selections: [
                { slug: "assistant", revision: 1, selected_model: "fast" },
              ],
            },
          ],
        });
      if (path.endsWith("/runs"))
        return Response.json({ data: [], next_after: null });
      return Response.json({ slug: "notes", name: "Notes", revision: 1 });
    }),
  );
  render(page("/workspaces/demo/evaluations/notes/runs/candidate"));
  const link = await screen.findByRole("link", {
    name: "Policy assistant · revision 1",
  });
  expect(link.getAttribute("href")).toBe(
    "/workspaces/demo/routing/assistant?tab=history&revision=1",
  );
  const user = userEvent.setup();
  await user.click(link);
  expect(
    await screen.findByRole("button", { name: "Review revision 1" }),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "Viewing saved revision 1 and earlier. Current workspace revision: 103.",
    ),
  ).toBeTruthy();
  expect(calls.some((path) => path.includes("/history?before=2"))).toBe(true);
  await user.click(screen.getByRole("button", { name: "Review revision 1" }));
  expect((await screen.findByRole("dialog")).textContent).toContain(
    "Captured configuration",
  );
  expect(screen.getByRole("dialog").textContent).not.toContain(
    "Current configuration",
  );
});

test("workspace member can create a custom routed model directly from the empty state", async () => {
  let savedPool: Record<string, unknown> | null = null;
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url: String(url), method, body });
      if (method === "PUT" && String(url).endsWith("/routing/fast-coding-pool")) {
        savedPool = { ...body, revision: 1 };
        return Response.json({ data: savedPool });
      }
      return Response.json({
        data: savedPool ? [savedPool] : [],
        next_after: null,
      });
    }),
  );
  render(page("/workspaces/demo/routing"));
  expect(
    await screen.findByRole("heading", { name: "No routing rules yet" }),
  ).toBeTruthy();
  const createButtons = screen.getAllByRole("button", {
    name: "Create routing rule",
  });
  expect(createButtons.length).toBeGreaterThanOrEqual(2);
  const user = userEvent.setup();
  await user.click(createButtons[0]!);
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toBeTruthy();

  await user.type(screen.getByLabelText("Name"), "Fast coding pool");
  expect((screen.getByLabelText("Slug") as HTMLInputElement).value).toBe(
    "fast-coding-pool",
  );
  await user.click(screen.getByLabelText("Model alias"));
  await user.type(screen.getByPlaceholderText("Search models…"), "gpt-4.1-mini");
  await user.click(screen.getByRole("option", { name: /Use exact alias/ }));
  await user.click(
    screen.getAllByRole("button", { name: "Create routing rule" }).at(-1)!,
  );

  expect(await screen.findByRole("link", { name: "Fast coding pool" })).toBeTruthy();
  const putCall = requests.find((req) => req.method === "PUT");
  expect(putCall).toBeTruthy();
  expect(putCall?.url).toContain(
    "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/routing/fast-coding-pool",
  );
  expect(putCall?.body).toMatchObject({
    slug: "fast-coding-pool",
    name: "Fast coding pool",
    revision: 0,
    enabled: true,
    default_action: "candidates",
    candidates: [
      { alias: "gpt-4.1-mini", priority: 100, weight: 1, enabled: true },
    ],
  });
});

test("workspace member can edit a custom routed model and restore an earlier revision", async () => {
  let current = {
    slug: "assistant",
    name: "Assistant",
    revision: 2,
    description: "Current policy",
    enabled: true,
    default_action: "candidates",
    candidates: [{ alias: "fast", enabled: true, priority: 100, weight: 2000 }],
    rules: [],
  };
  const earlier = {
    ...current,
    revision: 1,
    description: "Earlier policy",
    candidates: [{ alias: "fast", enabled: true, priority: 100, weight: 1000 }],
  };
  const putBodies: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "PUT" && String(url).endsWith("/routing/assistant")) {
        const body = JSON.parse(String(init?.body));
        putBodies.push(body);
        current = { ...body, revision: current.revision + 1 };
        return Response.json({ data: current });
      }
      if (String(url).includes("/history")) {
        return Response.json({ data: [current, earlier], next_before: null });
      }
      if (String(url).includes("/selections")) {
        return Response.json({ data: [] });
      }
      return Response.json({ data: current });
    }),
  );
  render(page("/workspaces/demo/routing/assistant?tab=history"));
  const editButton = await screen.findByRole("button", {
    name: "Edit routing",
  });
  const user = userEvent.setup();
  await user.click(editButton);
  const nameInput = await screen.findByLabelText("Name");
  await user.clear(nameInput);
  await user.type(nameInput, "Assistant v3");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(putBodies.length).toBe(1));
  expect(putBodies[0]).toMatchObject({
    slug: "assistant",
    name: "Assistant v3",
    revision: 2,
  });

  await user.click(await screen.findByRole("button", { name: "Review revision 1" }));
  await user.click(
    await screen.findByRole("button", { name: "Restore this revision" }),
  );
  await waitFor(() => expect(putBodies.length).toBe(2));
  expect(putBodies[1]).toMatchObject({
    slug: "assistant",
    description: "Earlier policy",
    revision: 3,
  });
});
