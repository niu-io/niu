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
  initialPolicy = policy,
}: {
  failed?: boolean;
  writer?: boolean;
  conflict?: boolean;
  tab?: string;
  initialPolicy?: typeof policy;
} = {}) {
  fixture.context = {
    token: "test-token",
    session: { permissions: { write: writer } },
    workspace: { id: "workspace", organization_id: "org" },
    models: [{ id: "example/model", provider: "openrouter" }],
  } as unknown as DashboardContext;
  const writes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PUT") {
        writes.push(JSON.parse(String(init.body)));
        return conflict
          ? Response.json({ error: { message: "Conflict" } }, { status: 409 })
          : Response.json({ revision: 8 });
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
        : Response.json({ data: { revision: 7, policy: initialPolicy } });
    }),
  );
  render(
    <MemoryRouter initialEntries={[`/guardrails?tab=${tab}`]}>
      <Routes>
        <Route path="/guardrails" element={<GuardrailsRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  return { writes, user: userEvent.setup() };
}

const inputSection = () => within(document.getElementById("input")!);
const outputSection = () => within(document.getElementById("output")!);

describe("workspace Guardrails page", () => {
  it("edits access, input, output and external checks directly on the Policy tab", async () => {
    setup();
    await screen.findByRole("textbox", { name: "Policy name" });
    expect(
      screen.getByRole("tab", { name: /^Policy/ }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Model restriction mode" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Provider restriction mode" }),
    ).toBeTruthy();
    expect(inputSection().getByRole("checkbox", { name: "Email addresses" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Output inspection mode" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add external check" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Configure" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("returns to model search after clearing unmatched results without saving access changes", async () => {
    const { user, writes } = setup();
    await screen.findByRole("textbox", { name: "Policy name" });
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
    await user.clear(await screen.findByRole("textbox", { name: "Policy name" }));
    await user.type(screen.getByRole("textbox", { name: "Policy name" }), "Updated policy");
    await user.click(screen.getByRole("button", { name: "Save all changes" }));
    await screen.findByRole("status");
    expect(writes).toEqual([{ expected_revision: 7, policy: { ...initial, name: "Updated policy" } }]);
  });

  it("preserves content rules and the expected revision while editing access", async () => {
    const { writes, user } = setup();
    await user.clear(await screen.findByRole("textbox", { name: "Policy name" }));
    await user.type(screen.getByRole("textbox", { name: "Policy name" }), "Updated policy");
    await user.click(screen.getByRole("button", { name: "Save all changes" }));
    await screen.findByRole("status");
    expect(writes).toEqual([
      { expected_revision: 7, policy: { ...policy, name: "Updated policy" } },
    ]);
    expect(screen.getByRole("button", { name: "Save all changes" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("does not offer an editable empty policy after a failed read", async () => {
    setup({ failed: true });
    await screen.findByRole("alert");
    expect(screen.queryByRole("textbox", { name: "Policy name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save all changes" })).toBeNull();
    expect(screen.getByRole("tab", { name: /^Policy/ })).toBeTruthy();
  });

  it("retains the draft on conflict and never automatically retries a write", async () => {
    const { writes, user } = setup({ conflict: true });
    await user.type(await screen.findByRole("textbox", { name: "Policy name" }), " changed");
    await user.click(screen.getByRole("button", { name: "Save all changes" }));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("alert")
          .some((alert) => alert.textContent?.includes("changed elsewhere")),
      ).toBe(true),
    );
    expect(writes).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Policy name" })).toHaveProperty(
      "value",
      "Workspace policy changed",
    );
    expect(screen.getByRole("button", { name: "Save all changes" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Policy name" })).toHaveProperty(
        "value",
        policy.name,
      ),
    );
    expect(writes).toHaveLength(1);
  });

  it("keeps policy controls read-only for readers", async () => {
    setup({ writer: false });
    expect(await screen.findByRole("textbox", { name: "Policy name" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Model restriction mode" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Provider restriction mode" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Save all changes" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("saves input changes without weakening model or output restrictions", async () => {
    const { writes, user } = setup();
    await screen.findByRole("textbox", { name: "Policy name" });
    await user.click(
      inputSection().getByRole("button", { name: "Email addresses action" }),
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Block", exact: true }));
    await user.click(screen.getByRole("button", { name: "Save all changes", exact: true }));
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
    await screen.findByRole("textbox", { name: "Policy name" });
    await user.click(
      outputSection().getByRole("checkbox", { name: "API key prefixes" }),
    );
    await user.click(screen.getByRole("button", { name: "Save all changes", exact: true }));
    await screen.findByText("Policy saved.");
    const { output: _output, ...withoutOutput } = policy;
    expect(writes).toEqual([{ expected_revision: 7, policy: withoutOutput }]);
  });

  it("preserves observation mode when editing output patterns", async () => {
    const { writes, user } = setup();
    await screen.findByRole("textbox", { name: "Policy name" });
    await user.click(screen.getByRole("button", { name: "Output inspection mode" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Observe only" }));
    await user.click(outputSection().getByRole("checkbox", { name: "Email addresses" }));
    await user.click(screen.getByRole("button", { name: "Save all changes" }));
    await screen.findByRole("status");
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
    const chooser = await screen.findByRole("button", { name: "Output inspection mode" });
    expect(chooser.textContent).toContain("Observe only");
    await user.click(outputSection().getByRole("checkbox", { name: "Email addresses" }));
    await user.click(screen.getByRole("button", { name: "Save all changes" }));
    await screen.findByRole("status");
    expect(writes).toMatchObject([{ policy: { output: { mode: "observe_only" } } }]);
  });

  it("makes hidden draft scope inspectable and allows discarding the whole policy", async () => {
    const { user, writes } = setup();
    await user.clear(await screen.findByRole("textbox", { name: "Policy name" }));
    await user.type(screen.getByRole("textbox", { name: "Policy name" }), "Draft name");
    expect(
      screen.getByText(
        "Unsaved workspace policy changes. Saving applies every change on this page.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Policy.*Unsaved changes/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Discard all changes" }));
    expect(screen.getByRole("textbox", { name: "Policy name" })).toHaveProperty(
      "value",
      policy.name,
    );
    expect(screen.getByRole("button", { name: "Save all changes" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(writes).toEqual([]);
  });

  it("blocks saving an empty policy name and restores the saved name on discard", async () => {
    const { user, writes } = setup();
    await user.clear(await screen.findByRole("textbox", { name: "Policy name" }));
    expect(
      screen.getByRole("textbox", { name: "Policy name" }).getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      screen.getByRole("link", { name: "Policy name" }).getAttribute("href"),
    ).toBe("#policy-name");
    expect(screen.getByRole("button", { name: "Save all changes" })).toHaveProperty(
      "disabled",
      true,
    );
    await user.click(screen.getByRole("button", { name: "Discard all changes" }));
    expect(screen.getByRole("textbox", { name: "Policy name" })).toHaveProperty(
      "value",
      policy.name,
    );
    expect(writes).toEqual([]);
  });

  it("saves access and input changes from the same page once", async () => {
    const { user, writes } = setup();
    await user.clear(await screen.findByRole("textbox", { name: "Policy name" }));
    await user.type(screen.getByRole("textbox", { name: "Policy name" }), "Reviewed policy");
    await user.click(
      inputSection().getByRole("button", { name: "Email addresses action" }),
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Block", exact: true }));
    await user.click(screen.getByRole("button", { name: "Save all changes" }));
    await screen.findByRole("status");
    expect(writes).toEqual([
      {
        expected_revision: 7,
        policy: {
          ...policy,
          name: "Reviewed policy",
          input_rules: [{ preset: "email_v1", action: "block" }],
        },
      },
    ]);
  });

  it("keeps an unsaved draft across tabs and restores it without a multi-section nag", async () => {
    const { user } = setup();
    const name = await screen.findByRole("textbox", { name: "Policy name" });
    await user.clear(name);
    await user.type(screen.getByRole("textbox", { name: "Policy name" }), "Draft policy");
    expect(screen.getByRole("tab", { name: /Policy.*Unsaved changes/ })).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "History" }));
    await screen.findByText("Workspace policy");
    expect(
      screen.getByRole("tab", { name: "History" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Save or discard your draft before restoring another policy version.")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: /^Policy/ }));
    expect(screen.getByRole("textbox", { name: "Policy name" })).toHaveProperty(
      "value",
      "Draft policy",
    );
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
    await screen.findByRole("textbox", { name: "Policy name" });
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
