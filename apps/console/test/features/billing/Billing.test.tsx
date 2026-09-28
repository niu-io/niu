import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BillingRoute from "../../../src/features/billing/page";
import type { ConsoleContext } from "../../../src/app/console-context";
const fixture = vi.hoisted(() => ({ context: {} as ConsoleContext }));
vi.mock("../../../src/app/console-context", () => ({
  useConsoleContext: () => fixture.context,
}));
const data = {
  balances: [
    {
      currency: "USD",
      charged_nanos: "6500011000",
      unbilled_nanos: "11000",
      due_nanos: "6500000000",
      paid_nanos: "0",
    },
  ],
  unresolved: "2",
  unpriced: "3",
  tariffs: [],
  invoices: [
    {
      id: "invoice-1",
      from_ms: 1700000000000,
      to_ms: 1700086400000,
      currency: "USD",
      amount_nanos: "6500000000",
      status: "issued",
      payment_reference: null,
    },
  ],
};
function setup(kind = "operator") {
  fixture.context = {
    token: "test",
    workspace: { id: "project", organization_id: "org" },
    session: { kind },
    models: [{ id: "qwen/text" }],
  } as unknown as ConsoleContext;
  return render(<BillingRoute />);
}
describe("customer billing", () => {
  it("shows independent exact balances and excludes unpriced usage without exposing financial writes", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data })));
    vi.stubGlobal("fetch", fetch);
    setup();
    await screen.findByText("USD 0.000011");
    expect(screen.getByText(/3 requests had no selling rate/)).toBeTruthy();
    expect(screen.getByText(/2 priced requests/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Issue invoice" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
    expect(fetch.mock.calls.length).toBe(1);
  });
  it("loads only the selected workspace invoice details", async () => {
    const fetch = vi.fn(
      async (url: unknown) =>
        new Response(
          JSON.stringify({
            data: String(url).endsWith("/invoice-1") ? [] : data,
          }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    setup();
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "View details" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url]) =>
            url ===
            "/admin/v1/organizations/org/projects/project/billing/invoices/invoice-1",
        ),
      ).toBe(true),
    );
    expect(await screen.findByText("Invoice invoice-1")).toBeTruthy();
  });
  it("lets installation administrators publish exact decimal rates", async () => {
    const fetch = vi.fn(
      async (_url: unknown, init?: RequestInit) =>
        new Response(
          JSON.stringify({
            data: init?.method === "POST" ? { revision: "new" } : data,
          }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    setup("installation");
    const user = userEvent.setup();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Set selling rates" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Set selling rates" }));
    await user.type(
      screen.getByLabelText("Input price per million tokens"),
      "0.000000001",
    );
    await user.type(
      screen.getByLabelText("Output price per million tokens"),
      "1.25",
    );
    await user.click(screen.getByRole("button", { name: "Publish rates" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, init]) =>
            url ===
              "/admin/v1/organizations/org/projects/project/billing/tariffs" &&
            init?.body ===
              JSON.stringify({
                model_alias: "qwen/text",
                currency: "USD",
                prompt_rate: "1",
                completion_rate: "1250000000",
                expected_revision: null,
              }),
        ),
      ).toBe(true),
    );
  });
});
