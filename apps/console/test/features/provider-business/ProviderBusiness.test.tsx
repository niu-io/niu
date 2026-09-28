import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, Link } from "react-router";
import ProviderBusinessRoute from "../../../src/features/provider-business/page";
import type { ConsoleContext } from "../../../src/app/console-context";
const fixture = vi.hoisted(() => ({ context: {} as ConsoleContext }));
vi.mock("../../../src/app/console-context", () => ({
  useConsoleContext: () => fixture.context,
}));
const response = {
  id: "supplier",
  name: "Example supplier",
  days: 30,
  balances: [
    {
      currency: "USD",
      earned_nanos: "1200000000",
      unpaid_nanos: "1000000000",
      paid_nanos: "200000000",
      period_nanos: "1200000000",
    },
  ],
  traffic: {
    requests: "12",
    completed: "10",
    unresolved: "2",
    prompt_tokens: "1000000",
    completion_tokens: "200000",
  },
  daily: [],
  offers: [
    {
      id: "offer",
      model_alias: "qwen/qwen3",
      active: true,
      route_ready: true,
      revision: "v1",
      currency: "USD",
      prompt_rate: "1000000000",
      completion_rate: "2000000000",
    },
  ],
  consumption: [],
  settlements: [],
};
function setup(role?: "manager" | "viewer") {
  fixture.context = {
    token: "test",
    session: {
      kind: "operator",
      operator: null,
      permissions: { read: true, write: true, manage_operators: true },
      provider_memberships: role
        ? [{ id: "supplier", name: "Example supplier", role }]
        : [],
    },
    refreshWorkspace: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConsoleContext;
  return render(
    <MemoryRouter initialEntries={["/providers/supplier"]}>
      <Link to="/providers/supplier/models">Model offers</Link><Link to="/providers/supplier/consumption">Consumption</Link><Routes>
        <Route
          path="/providers/:provider/:section?"
          element={<ProviderBusinessRoute />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
describe("provider business access and earnings", () => {
  it("denies a customer even when they manage workspace operators, without fetching earnings", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setup();
    expect(screen.getByText("Supplier access required")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shows earnings independently from unresolved usage and does not give viewers offer controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: response }))),
    );
    setup("viewer");
    expect(await screen.findByText("USD 1.2")).toBeTruthy();
    expect(screen.getByText("Awaiting earnings reconciliation")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole("link", { name: "Model offers", exact: true }));
    expect(screen.getByText("qwen/qwen3")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  });
  it("allows explicit provider managers to pause an offer with a scoped API mutation", async () => {
    const fetch = vi.fn(
      async (_url: unknown, init?: RequestInit) =>
        new Response(
          JSON.stringify({
            data: init?.method === "PATCH" ? { active: false } : response,
          }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    setup("manager");
    await screen.findByText("USD 1.2");
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("link", { name: "Model offers", exact: true }),
    );
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, init]) =>
            url === "/admin/v1/providers/supplier/offers/offer" &&
            init?.method === "PATCH" &&
            init.body === '{"active":false}',
        ),
      ).toBe(true),
    );
  });
  it("clears financial data and rechecks session after membership revocation", async () => {
    let revoked = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        revoked
          ? new Response(
              JSON.stringify({ error: { message: "Access revoked" } }),
              { status: 404 },
            )
          : new Response(JSON.stringify({ data: response })),
      ),
    );
    setup("viewer");
    await screen.findByText("USD 1.2");
    revoked = true;
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Refresh supplier data" }));
    await screen.findByText("Access revoked");
    expect(screen.queryByText("USD 1.2")).toBeNull();
    expect(fixture.context.refreshWorkspace).toHaveBeenCalled();
  });
});

it("reports model consumption without customer request identifiers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              ...response,
              consumption: [
                {
                  model_alias: "qwen/qwen3",
                  revision: "rate-1",
                  currency: "USD",
                  prompt_rate: "1000000000",
                  completion_rate: "2000000000",
                  requests: "12",
                  prompt_tokens: "1000000",
                  completion_tokens: "200000",
                  amount_nanos: "1400000000",
                  unpaid_nanos: "1400000000",
                },
              ],
            },
          }),
        ),
    ),
  );
  setup("viewer");
  await screen.findByText("USD 1.2");
    await userEvent
      .setup()
      .click(screen.getByRole("link", { name: "Consumption", exact: true }));
    expect(
      await screen.findByRole("heading", { name: "Model usage" }),
    ).toBeTruthy();
  expect(screen.getAllByText("USD 1.4").length).toBe(2);
  expect(screen.queryByRole("columnheader", { name: "Customer" })).toBeNull();
  expect(screen.queryByRole("columnheader", { name: "Task" })).toBeNull();
  expect(screen.queryByText("rate-1")).toBeNull();
});
