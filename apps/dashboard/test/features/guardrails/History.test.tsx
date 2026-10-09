import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import GuardrailHistory from "../../../src/features/guardrails/History";

const row = (revision: number) => ({
  revision,
  policy_name: `Policy version ${revision}`,
  active: revision === 3,
  actor_name: "Workspace administrator",
  activated_at: "2026-10-03T00:00:00Z",
  restored_from_revision: revision === 3 ? 1 : null,
});
function mount(canWrite = false) {
  render(
    <MemoryRouter>
      <GuardrailHistory
        token="fixture-token"
        endpoint="/scope/guardrails"
        canWrite={canWrite}
      />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe("workspace policy history", () => {
  it("refreshes history to include changes made elsewhere", async () => {
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [row(++reads === 1 ? 2 : 3)], next_cursor: null })));
    const user = mount();
    await screen.findByText("Policy version 2");
    await user.click(screen.getByRole("button", { name: "Refresh policy history" }));
    await screen.findByText("Policy version 3");
    expect(screen.queryByText("Policy version 2")).toBeNull();
    expect(reads).toBe(2);
  });
  it("shows rollback attribution and appends exclusive cursor pages", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        urls.push(String(input));
        return Response.json(
          urls.length === 1
            ? { data: [row(3), row(2)], next_cursor: 2 }
            : { data: [row(1)], next_cursor: null },
        );
      }),
    );
    const user = mount();
    await screen.findByText("Restored from version 1");
    await user.click(
      screen.getByRole("button", { name: "Load older versions" }),
    );
    await screen.findByText("Policy version 1");
    expect(urls).toEqual([
      "/scope/guardrails/history",
      "/scope/guardrails/history?before_revision=2",
    ]);
    expect(screen.getAllByText(/Policy version [123]/)).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: "Load older versions" }),
    ).toBeNull();
  });
  it("does not misreport a failed read as an empty history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { message: "Unavailable" } }, { status: 503 }),
      ),
    );
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByText("No policy versions yet.")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("retains the loaded page and cursor after an older-page failure", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        urls.push(String(input));
        if (urls.length === 2)
          return Response.json(
            { error: { message: "Unavailable" } },
            { status: 503 },
          );
        return Response.json(
          urls.length === 1
            ? { data: [row(3)], next_cursor: 3 }
            : { data: [row(2)], next_cursor: null },
        );
      }),
    );
    const user = mount();
    await screen.findByText("Policy version 3");
    await user.click(
      screen.getByRole("button", { name: "Load older versions" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByText("Policy version 3")).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Load older versions" }),
      ).toHaveProperty("disabled", false),
    );
    await user.click(
      screen.getByRole("button", { name: "Load older versions" }),
    );
    await screen.findByText("Policy version 2");
    expect(urls.slice(1)).toEqual([
      "/scope/guardrails/history?before_revision=3",
      "/scope/guardrails/history?before_revision=3",
    ]);
  });
});

describe("policy version review and restore", () => {
  const version = {
    revision: 1,
    policy: {
      name: "Policy version 1",
      models: { mode: "deny_all" },
      providers: { mode: "inherit" },
      input_rules: [{ preset: "email_v1", action: "redact" }],
      output: {
        mode: "buffered_full",
        rules: [{ preset: "api_key_prefix_v1", action: "block" }],
      },
    },
  };
  function transport(conflict = false, observation = false) {
    const writes: unknown[] = [];
    let restored = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/rollback")) {
          writes.push(JSON.parse(String(init?.body)));
          if (conflict)
            return Response.json(
              { error: { message: "Conflict" } },
              { status: 409 },
            );
          restored = true;
          return Response.json({ revision: 4, restored_from_revision: 1 });
        }
        if (url.endsWith("/revisions/1"))
          return Response.json({ data: observation ? {...version, policy:{...version.policy,output:{...version.policy.output,mode:"observe_only"}}} : version });
        return Response.json({
          data: restored
            ? [
                { ...row(4), active: true },
                { ...row(3), active: false },
                row(1),
              ]
            : [row(3), row(1)],
          next_cursor: null,
        });
      }),
    );
    return writes;
  }
  it("returns focus to the reviewed version when its dialog is dismissed", async () => {
    const writes=transport();
    const user=mount();
    const opener=await screen.findByRole('button',{name:'Policy version 1',exact:true});
    await user.click(opener);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(()=>expect(document.activeElement).toBe(opener));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes).toHaveLength(0);
  });
  it("labels a saved observation version without claiming buffering or redaction", async () => {
    transport(false,true);
    const user=mount();
    await user.click(await screen.findByRole("button",{name:"Policy version 1",exact:true}));
    await screen.findByText("Observe only · response unchanged");
    expect(screen.queryByText("Buffered full-text inspection")).toBeNull();
    expect(screen.getByText("Observe")).toBeTruthy();
  });
  it("reviews the exact saved rules before restoring with the current head revision", async () => {
    const writes = transport();
    const user = mount(true);
    await user.click(
      await screen.findByRole("button", {
        name: "Policy version 1",
        exact: true,
      }),
    );
    await screen.findByText("email_v1");
    expect(screen.getByText("api_key_prefix_v1")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Restore this version" }),
    );
    await screen.findByText("Policy restored as a new active version.");
    expect(writes).toEqual([{ expected_revision: 3, target_revision: 1 }]);
    await screen.findByRole("button", {
      name: "Policy version 4",
      exact: true,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("requires a history reload after conflict without retrying the restore", async () => {
    const writes = transport(true);
    const user = mount(true);
    await user.click(
      await screen.findByRole("button", {
        name: "Policy version 1",
        exact: true,
      }),
    );
    await screen.findByText("email_v1");
    await user.click(
      screen.getByRole("button", { name: "Restore this version" }),
    );
    await screen.findByRole("button", { name: "Reload history" });
    expect(writes).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Restore this version" }),
    ).toBeNull();
  });
  it("allows readers to inspect rules without a restore action", async () => {
    const writes = transport();
    const user = mount();
    await user.click(
      await screen.findByRole("button", {
        name: "Policy version 1",
        exact: true,
      }),
    );
    await screen.findByText("email_v1");
    expect(
      screen.queryByRole("button", { name: "Restore this version" }),
    ).toBeNull();
    expect(writes).toHaveLength(0);
  });
});
