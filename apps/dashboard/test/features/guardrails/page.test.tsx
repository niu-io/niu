import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import GuardrailsRoute from "../../../src/features/guardrails/page";
import type { DashboardContext } from "../../../src/app/dashboard-context";

const fixture = vi.hoisted(() => ({ context: {} as DashboardContext }));
vi.mock("../../../src/app/dashboard-context", () => ({
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
function setup({
  failed = false,
  writer = true,
  conflict = false,
  section = "access",
  initialPolicy = policy,
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
    vi.fn(async (_input, init?: RequestInit) => {
      if (init?.method === "PUT") {
        writes.push(JSON.parse(String(init.body)));
        return conflict
          ? Response.json({ error: { message: "Conflict" } }, { status: 409 })
          : Response.json({ revision: 8 });
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
    <MemoryRouter initialEntries={[`/guardrails/${section}`]}>
      <Routes>
        <Route path="/guardrails/:section" element={<GuardrailsRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  return { writes, user: userEvent.setup() };
}

describe("workspace Guardrails editor", () => {
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
  it("distinguishes observation from enforcement in the policy summary", async () => {
    setup({ section: "policy", initialPolicy: { ...policy, output: { ...policy.output, mode: "observe_only" } } });
    expect(await screen.findByText("Record rule matches without blocking or changing responses.")).toBeTruthy();
    expect(screen.getByText("Observe only")).toBeTruthy();
    expect(screen.queryByText("Inspect complete generated text before delivery.")).toBeNull();
  });
  it("preserves required detector consent while editing model access", async () => {
    const initial = { ...policy, input_detectors: [{ detector: "review", configuration_fingerprint: "a".repeat(64), consent_to_external_processing: true }] };
    const { writes, user } = setup({ initialPolicy: initial });
    await user.clear(await screen.findByRole("textbox", { name: "Policy name" }));
    await user.type(screen.getByRole("textbox", { name: "Policy name" }), "Updated policy");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("status");
    expect(writes).toEqual([{ expected_revision: 7, policy: { ...initial, name: "Updated policy" } }]);
  });
  it("preserves content rules and the expected revision while editing access", async () => {
    const { writes, user } = setup();
    await user.clear(
      await screen.findByRole("textbox", { name: "Policy name" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Policy name" }),
      "Updated policy",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("status");
    expect(writes).toEqual([
      { expected_revision: 7, policy: { ...policy, name: "Updated policy" } },
    ]);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
  });
  it("does not offer an editable empty policy after a failed read", async () => {
    setup({ failed: true });
    await screen.findByRole("alert");
    expect(screen.queryByRole("textbox", { name: "Policy name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
  it("retains the draft on conflict and never automatically retries a write", async () => {
    const { writes, user } = setup({ conflict: true });
    await user.type(
      await screen.findByRole("textbox", { name: "Policy name" }),
      " changed",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "changed elsewhere",
      ),
    );
    expect(writes).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Policy name" })).toHaveProperty(
      "value",
      "Workspace policy changed",
    );
  });
  it("keeps policy controls read-only for readers", async () => {
    setup({ writer: false });
    expect(
      await screen.findByRole("textbox", { name: "Policy name" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Model restriction mode" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Provider restriction mode" }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});

it("saves input changes without weakening model or output restrictions", async () => {
  const { writes, user } = setup({ section: "input" });
  await user.click(
    await screen.findByRole("button", { name: "Email addresses action" }),
  );
  await user.click(
    screen.getByRole("menuitemradio", { name: "Block", exact: true }),
  );
  await user.click(screen.getByRole("button", { name: "Save", exact: true }));
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
  const { writes, user } = setup({ section: "output" });
  await user.click(
    await screen.findByRole("checkbox", { name: "API key prefixes" }),
  );
  await user.click(screen.getByRole("button", { name: "Save", exact: true }));
  await screen.findByText("Policy saved.");
  const { output: _output, ...withoutOutput } = policy;
  expect(writes).toEqual([{ expected_revision: 7, policy: withoutOutput }]);
});

it("preserves observation mode when editing output patterns", async () => {
  const {writes,user}=setup({section:"output"});
  await screen.findByRole("button",{name:"Output inspection mode"});
  await user.click(screen.getByRole("button",{name:"Output inspection mode"}));
  await user.click(screen.getByRole("menuitemradio",{name:"Observe only"}));
  await user.click(screen.getByRole("checkbox",{name:"Email addresses"}));
  await user.click(screen.getByRole("button",{name:"Save"}));
  await screen.findByRole("status");
  expect(writes).toMatchObject([{policy:{output:{mode:"observe_only",rules:expect.arrayContaining([{preset:"email_v1",action:"redact"}])}}}]);
});

it("preserves the mode of a saved observation policy without reselecting it", async()=>{
  const {writes,user}=setup({section:"output",initialPolicy:{...policy,output:{...policy.output,mode:"observe_only"}}});
  const chooser=await screen.findByRole("button",{name:"Output inspection mode"});
  expect(chooser.textContent).toContain("Observe only");
  await user.click(screen.getByRole("checkbox",{name:"Email addresses"}));
  await user.click(screen.getByRole("button",{name:"Save"}));
  await screen.findByRole("status");
  expect(writes).toMatchObject([{policy:{output:{mode:"observe_only"}}}]);
});
