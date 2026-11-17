import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import GuardrailsRoute from "../../../app/features/guardrails/page";
import type { DashboardContext } from "../../../app/shell/dashboard-context";

const fixture = vi.hoisted(() => ({ context: {} as DashboardContext }));
vi.mock("../../../app/shell/dashboard-context", () => ({
  useDashboardContext: () => fixture.context,
}));

const policy = {
  schema_version: 1,
  name: "Workspace policy",
  models: { mode: "inherit" },
  providers: { mode: "inherit" },
  input_rules: [{ preset: "email_v1", action: "redact" }],
  output: {
    mode: "buffered_full",
    rules: [{ preset: "api_key_prefix_v1", action: "block" }],
  },
};
const denial = {
  reason: "input_blocked",
  key_name: "Development key",
  workspace_policy_name: "Workspace policy",
  workspace_revision: 7,
  key_policy_name: null,
  key_policy_revision: null,
  recorded_at: "2026-10-03T01:00:00Z",
};
const history = {
  revision: 7,
  policy_name: "Workspace policy",
  active: true,
  actor_name: "Workspace administrator",
  activated_at: "2026-10-03T00:00:00Z",
  restored_from_revision: null,
};

function setup({
  failed = false,
  writer = true,
  conflict = false,
  tab = "policy",
  initialPolicy = policy as typeof policy | null,
}: {
  failed?: boolean;
  writer?: boolean;
  conflict?: boolean;
  tab?: string;
  initialPolicy?: typeof policy | null;
} = {}) {
  fixture.context = {
    token: "test-token",
    session: { permissions: { write: writer } },
    workspace: { id: "workspace", organization_id: "org" },
    models: [{ id: "example/model", provider: "openrouter" }],
  } as unknown as DashboardContext;
  const writes: unknown[] = [];
  let serverPolicy = initialPolicy;
  let serverRevision = 7;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PUT") {
        writes.push(JSON.parse(String(init.body)));
        if (conflict) {
          serverRevision = 8;
          return Response.json({ error: { message: "Conflict" } }, { status: 409 });
        }
        return Response.json({ revision: 8 });
      }
      if (url.endsWith("/denials")) {
        return Response.json({
          data: [denial],
          coverage: "latest_100_preparation_denials",
        });
      }
      if (url.endsWith("/dispatch-denials")) {
        return Response.json({
          data: [],
          coverage: "latest_100_dispatch_policy_exceptions",
        });
      }
      if (url.endsWith("/detectors")) return Response.json({ data: [] });
      if (url.endsWith("/history")) {
        return Response.json({ data: [history], next_cursor: null });
      }
      return failed
        ? Response.json(
            { error: { message: "Service unavailable" } },
            { status: 503 },
          )
        : Response.json({
            data: serverPolicy ? { revision: serverRevision, policy: serverPolicy } : null,
          });
    }),
  );
  render(
    <MemoryRouter initialEntries={[`/guardrails?tab=${tab}`]}>
      <Routes>
        <Route path="/guardrails" element={<GuardrailsRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  return {
    writes,
    setServerPolicy(next: typeof policy) {
      serverPolicy = next;
    },
    user: userEvent.setup(),
  };
}

const inputSection = () => within(document.getElementById("input")!);
const outputSection = () => within(document.getElementById("output")!);

describe("workspace Guardrails page", () => {
  it("renders a read-only summary on the Policy tab and opens the editor dialog for edits", async () => {
    const { user } = setup();
    await screen.findByRole("heading", { name: "Workspace policy" });
    expect(
      screen.getByRole("tab", { name: /^Policy/ }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.queryByRole("textbox", { name: "Policy name" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/Email addresses/)).toBeTruthy();

    const editButton = screen.getByRole("button", { name: "Edit policy" });
    await user.click(editButton);

    const dialog = await screen.findByRole("dialog", { name: "Edit policy" });
    expect(within(dialog).getByRole("textbox", { name: "Policy name" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Model restriction mode" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Provider restriction mode" })).toBeTruthy();
    expect(inputSection().getByRole("checkbox", { name: "Email addresses" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Output inspection mode" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Add external check" })).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(editButton);
  });

  it("returns to model search after clearing unmatched results without saving access changes", async () => {
    const { user, writes } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit policy" }));
    await user.click(screen.getByRole("button", { name: "Model restriction mode" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Allow selected" }));
    await user.click(screen.getByRole("button", { name: "Choose models (0)" }));
    const search = screen.getByRole("textbox", { name: "Search models" });
    await user.type(search, "missing-model");
    expect(screen.getByText("No matching models.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(document.activeElement).toBe(search));
    expect(screen.getByRole("menuitemcheckbox", { name: "example/model" })).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it("preserves required detector consent while editing model access", async () => {
    const initial = {
      ...policy,
      input_detectors: [
        {
          detector: "review",
          configuration_fingerprint: "a".repeat(64),
          consent_to_external_processing: true,
        },
      ],
    };
    const { writes, user } = setup({ initialPolicy: initial });
    await user.click(await screen.findByRole("button", { name: "Edit policy" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit policy" });
    await user.clear(within(dialog).getByRole("textbox", { name: "Policy name" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Policy name" }), "Updated policy");
    await user.click(within(dialog).getByRole("button", { name: "Save policy" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findByText("Policy saved.");
    expect(writes).toEqual([{ expected_revision: 7, policy: { ...initial, name: "Updated policy" } }]);
  });

  it("preserves content rules and the expected revision while editing access", async () => {
    const { writes, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit policy" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit policy" });
    await user.clear(within(dialog).getByRole("textbox", { name: "Policy name" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Policy name" }), "Updated policy");
    await user.click(within(dialog).getByRole("button", { name: "Save policy" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findByRole("heading", { name: "Updated policy" });
    expect(writes).toEqual([
      { expected_revision: 7, policy: { ...policy, name: "Updated policy" } },
    ]);
  });

  it("does not offer an editable empty policy after a failed read", async () => {
    setup({ failed: true });
    await screen.findByRole("alert");
    expect(screen.queryByRole("textbox", { name: "Policy name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create policy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit policy" })).toBeNull();
    expect(screen.getByRole("tab", { name: /^Policy/ })).toBeTruthy();
  });

  it("retains the draft inside the dialog on conflict and reloads latest revision without retrying", async () => {
    const { writes, user } = setup({ conflict: true });
    await user.click(await screen.findByRole("button", { name: "Edit policy" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit policy" });
    await user.type(within(dialog).getByRole("textbox", { name: "Policy name" }), " changed");
    await user.click(within(dialog).getByRole("button", { name: "Save policy" }));
    await waitFor(() =>
      expect(
        within(dialog)
          .getAllByRole("alert")
          .some((alert) => alert.textContent?.includes("changed elsewhere")),
      ).toBe(true),
    );
    expect(writes).toHaveLength(1);
    expect(within(dialog).getByRole("textbox", { name: "Policy name" })).toHaveProperty(
      "value",
      "Workspace policy changed",
    );
    expect(within(dialog).queryByRole("button", { name: "Save policy" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Reload" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: "Policy name" })).toHaveProperty(
        "value",
        policy.name,
      ),
    );
    expect(writes).toHaveLength(1);
  });

  it("keeps policy summary read-only for readers without exposing Edit or Create actions", async () => {
    setup({ writer: false });
    await screen.findByRole("heading", { name: "Workspace policy" });
    expect(screen.queryByRole("button", { name: "Edit policy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create policy" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Policy name" })).toBeNull();
  });

  it("saves input changes without weakening model or output restrictions", async () => {
    const { writes, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit policy" }));
    await user.click(
      inputSection().getByRole("button", { name: "Email addresses action" }),
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Block", exact: true }));
    await user.click(screen.getByRole("button", { name: "Save policy", exact: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findByText("Policy saved.");
    expect(writes).toEqual([
      {
        expected_revision: 7,
        policy: {
          ...policy,
          input_rules: [{ preset: "email_v1", action: "block" }],
        },
      },
    ]);
  });

  it("removes empty output configuration instead of saving an invalid empty output policy", async () => {
    const { writes, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit policy" }));
    await user.click(
      outputSection().getByRole("checkbox", { name: "API key prefixes" }),
    );
    await user.click(screen.getByRole("button", { name: "Save policy", exact: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findByText("Policy saved.");
    const { output: _output, ...withoutOutput } = policy;
    expect(writes).toEqual([{ expected_revision: 7, policy: withoutOutput }]);
  });

  it("preserves observation mode when editing output patterns", async () => {
    const { writes, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit policy" }));
    await user.click(screen.getByRole("button", { name: "Output inspection mode" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Observe only" }));
    await user.click(outputSection().getByRole("checkbox", { name: "Email addresses" }));
    await user.click(screen.getByRole("button", { name: "Save policy" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findByText("Policy saved.");
    expect(writes).toMatchObject([
      {
        policy: {
          output: {
            mode: "observe_only",
            rules: expect.arrayContaining([{ preset: "email_v1", action: "redact" }]),
          },
        },
      },
    ]);
  });

  it("preserves the mode of a saved observation policy without reselecting it", async () => {
    const { writes, user } = setup({
      initialPolicy: { ...policy, output: { ...policy.output, mode: "observe_only" } },
    });
    await user.click(await screen.findByRole("button", { name: "Edit policy" }));
    const chooser = await screen.findByRole("button", { name: "Output inspection mode" });
    expect(chooser.textContent).toContain("Observe only");
    await user.click(outputSection().getByRole("checkbox", { name: "Email addresses" }));
    await user.click(screen.getByRole("button", { name: "Save policy" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findByText("Policy saved.");
    expect(writes).toMatchObject([{ policy: { output: { mode: "observe_only" } } }]);
  });

  it("discards unsaved dialog edits cleanly on Cancel without affecting saved policy", async () => {
    const { user, writes } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit policy" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit policy" });
    await user.clear(within(dialog).getByRole("textbox", { name: "Policy name" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Policy name" }), "Draft name");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: policy.name })).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it("blocks saving an empty policy name inside the dialog", async () => {
    const { user, writes } = setup();
    await user.click(await screen.findByRole("button", { name: "Edit policy" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit policy" });
    await user.clear(within(dialog).getByRole("textbox", { name: "Policy name" }));
    expect(
      within(dialog).getByRole("textbox", { name: "Policy name" }).getAttribute("aria-invalid"),
    ).toBe("true");
    expect(within(dialog).getByRole("button", { name: "Save policy" })).toHaveProperty(
      "disabled",
      true,
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(writes).toEqual([]);
  });

  it("creates an initial policy via the Create policy dialog when empty", async () => {
    const { user, writes } = setup({ initialPolicy: null });
    await user.click(await screen.findByRole("button", { name: "Create policy" }));
    const dialog = await screen.findByRole("dialog", { name: "Create policy" });
    await user.click(within(dialog).getByRole("button", { name: "Create policy" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(writes).toEqual([
      {
        expected_revision: 0,
        policy: {
          schema_version: 1,
          name: "Workspace default",
          models: { mode: "inherit" },
          providers: { mode: "inherit" },
        },
      },
    ]);
  });

  it("opens rule testing dialog from the summary view", async () => {
    const { user } = setup();
    const testButton = await screen.findByRole("button", { name: "Test rules" });
    await user.click(testButton);
    const dialog = await screen.findByRole("dialog", { name: "Test rules" });
    expect(within(dialog).getByLabelText("Sample text")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(testButton);
  });

  it("opens a deep-linked tab from the tab query parameter", async () => {
    setup({ tab: "history" });
    expect(
      (await screen.findByRole("tab", { name: "History" })).getAttribute("aria-selected"),
    ).toBe("true");
    await screen.findByText("Workspace policy");
    expect(
      screen.getByRole("tab", { name: "History" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.queryByRole("textbox", { name: "Policy name" })).toBeNull();
  });

  it("opens blocked-request evidence from the Blocked requests tab", async () => {
    const { user } = setup();
    await screen.findByRole("heading", { name: "Workspace policy" });
    await user.click(screen.getByRole("tab", { name: "Blocked requests" }));
    await screen.findByText("Input matched a blocking rule");
    expect(
      screen.getByRole("tab", { name: "Blocked requests" }).getAttribute("aria-selected"),
    ).toBe("true");
    const evidence = screen.getAllByRole("link", { name: "Workspace policy · Version 7" });
    expect(evidence[0].getAttribute("href")).toContain("?tab=history&revision=7&from=blocked");
    await user.click(evidence[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Workspace policy")).toBeTruthy();
    expect(within(dialog).getByText(/Version 7/)).toBeTruthy();
  });
});
