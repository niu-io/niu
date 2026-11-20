import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import GuardrailsLegacyRoute, {
  clientLoader,
} from "../../../app/features/guardrails/legacy-route";
import { guardrailsLegacyTarget } from "../../../app/features/guardrails/legacy";
import {
  setActiveNavigationHash,
} from "../../../app/shell/legacy-redirect-route";

function LocationProbe() {
  const location = useLocation();
  return (
    <p data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </p>
  );
}

function renderLegacy(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/workspaces/:workspace/guardrails"
          element={<LocationProbe />}
        />
        <Route
          path="/workspaces/:workspace/guardrails/*"
          element={
            <>
              <GuardrailsLegacyRoute />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("legacy Guardrails section routes", () => {
  it("maps every old policy section to the canonical Policy tab and anchor", () => {
    const base = "/workspaces/acme/guardrails";
    expect(guardrailsLegacyTarget(`${base}/policy`, "", "", "policy")).toBe(
      `${base}?tab=policy`,
    );
    expect(guardrailsLegacyTarget(`${base}/access`, "", "", "access")).toBe(
      `${base}?tab=policy#access`,
    );
    expect(guardrailsLegacyTarget(`${base}/input`, "", "", "input")).toBe(
      `${base}?tab=policy#input`,
    );
    expect(guardrailsLegacyTarget(`${base}/output`, "", "", "output")).toBe(
      `${base}?tab=policy#output`,
    );
    expect(guardrailsLegacyTarget(`${base}/detectors`, "", "", "detectors")).toBe(
      `${base}?tab=policy#detectors`,
    );
    expect(
      guardrailsLegacyTarget(`${base}/policy/access`, "", "", "policy/access"),
    ).toBe(`${base}?tab=policy#access`);
  });

  it("moves Denials and History to tabs while preserving revision evidence", () => {
    const base = "/workspaces/acme/guardrails";
    expect(guardrailsLegacyTarget(`${base}/denials`, "", "", "denials")).toBe(
      `${base}?tab=blocked`,
    );
    expect(
      guardrailsLegacyTarget(
        `${base}/history`,
        "?revision=4&from=blocked",
        "",
        "history",
      ),
    ).toBe(`${base}?tab=history&revision=4&from=blocked`);
    expect(
      guardrailsLegacyTarget(`${base}/obsolete`, "?tab=history", "", "obsolete"),
    ).toBe(`${base}?tab=policy`);
  });

  it("redirects at the route loader without rendering a second navigation level", () => {
    setActiveNavigationHash("#input");
    try {
      const response = clientLoader({
        request: new Request(
          "http://localhost/workspaces/acme/guardrails/policy?view=full",
        ),
        params: { "*": "policy" },
        context: {},
      } as never) as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "/workspaces/acme/guardrails?tab=policy&view=full#input",
      );
    } finally {
      setActiveNavigationHash("");
    }
  });

  it("renders a replace navigation for direct component use", async () => {
    renderLegacy("/workspaces/acme/guardrails/policy/access");
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/workspaces/acme/guardrails?tab=policy#access",
      ),
    );
  });

  it("keeps blocked-request history evidence in the canonical history tab", async () => {
    renderLegacy(
      "/workspaces/acme/guardrails/history?revision=4&from=blocked",
    );
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/workspaces/acme/guardrails?tab=history&revision=4&from=blocked",
      ),
    );
  });
});
