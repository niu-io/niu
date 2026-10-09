import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExternalDetectors, { type DetectorBinding } from "../../../src/features/guardrails/ExternalDetectors";
const fingerprint = "a".repeat(64);
const description = { schema_version: 1, detector: "review", configuration_fingerprint: fingerprint, recipient: "Verification service", region: "Local", retention: "No persisted content", policy_activation: true, processing_guarantees: "declared_unverified", content_sent: "request_text_after_local_redaction", external_charge: "declared_unmetered", timeout_ms: 1000, max_text_bytes: 65536 };
function setup(disabled = false, data = [description], bindings: DetectorBinding[] = []) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data })));
  const onChange = vi.fn();
  render(<ExternalDetectors token="reader" endpoint="/scope/guardrails" bindings={bindings} disabled={disabled} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}
describe("external detector processing consent", () => {
  it("requires explicit consent for the selected fingerprint and does not send test text", async () => {
    const { onChange, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Add external check" }));
    await user.click(screen.getByRole("button", { name: "Choose external detector" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Verification service" }));
    const requireButton = screen.getByRole("button", { name: "Require this detector" });
    expect(requireButton).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("checkbox"));
    await user.click(requireButton);
    expect(onChange).toHaveBeenCalledWith([{ detector: "review", configuration_fingerprint: fingerprint, consent_to_external_processing: true }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/scope/guardrails/detectors", expect.objectContaining({ method: "GET" }));
  });
  it("clears consent when another recipient is chosen", async () => {
    const { user } = setup(false, [description, { ...description, detector: "alternate", recipient: "Alternate service" }]);
    await user.click(await screen.findByRole("button", { name: "Add external check" }));
    await user.click(screen.getByRole("button", { name: "Choose external detector" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Verification service" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Choose external detector" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Alternate service" }));
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("button", { name: "Require this detector" })).toHaveProperty("disabled", true);
  });
  it("does not invite consent or activation for unknown service charges", async () => {
    const { user, onChange } = setup(false, [{ ...description, external_charge: "unknown" }]);
    await user.click(await screen.findByRole("button", { name: "Add external check" }));
    await user.click(screen.getByRole("button", { name: "Choose external detector" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Verification service" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Require this detector" })).toHaveProperty("disabled", true);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("keeps stale saved requirements visible without allowing a reader to remove them", async () => {
    const { onChange } = setup(true, [description], [{ detector: "review", configuration_fingerprint: "b".repeat(64), consent_to_external_processing: true }]);
    await screen.findByText("Review required · requests remain blocked");
    expect(screen.getByRole("button", { name: "Remove" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "Add external check" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText(fingerprint)).toBeNull();
  });
});
