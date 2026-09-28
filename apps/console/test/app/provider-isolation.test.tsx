import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { appRoutes } from "../../src/app/routes";

describe("Providers shell", () => {
  it("keeps consumer navigation and organization metadata out of provider routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "ok" }))),
    );
    render(
      <RouterProvider
        router={createMemoryRouter(appRoutes, {
          initialEntries: ["/providers/supplier"],
        })}
      />,
    );
    await screen.findByRole("heading", { name: "Provider access required" });
    expect(screen.getByRole("navigation", { name: "Provider navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Model offers" }).getAttribute("href")).toBe("/providers/supplier/models");
    await userEvent.setup().click(screen.getByRole("link", { name: "Settlements" }));
    expect(screen.getByRole("link", { name: "Settlements" }).getAttribute("aria-current")).toBe("page");
    expect(
      screen.queryByRole("link", { name: "Workspace", exact: true }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Models", exact: true }),
    ).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Main navigation" }),
    ).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Account menu" }));
    expect(await screen.findByText("Provider account")).toBeTruthy();
    for (const name of [
      "Workspace",
      "Usage",
      "API keys",
      "Organization settings",
      "Administration",
    ])
      expect(screen.queryByRole("menuitem", { name, exact: true })).toBeNull();
  });
  it("keeps supplier management separate from platform settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "ok" }))),
    );
    render(
      <RouterProvider
        router={createMemoryRouter(appRoutes, {
          initialEntries: ["/providers"],
        })}
      />,
    );
    await screen.findByRole("heading", {
      name: "Provider access required",
    });
    expect(
      screen.getByRole("link", { name: "Provider configuration" }).getAttribute("href"),
    ).toBe("/providers/configuration");
    expect(
      screen.queryByRole("navigation", { name: "Main navigation" }),
    ).toBeNull();
  });
});
