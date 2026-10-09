import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContentRules from "../../../src/features/guardrails/ContentRules";
import {
  contentRulesError,
  type ContentRule,
} from "../../../src/features/guardrails/rules";
function Harness({
  stage = "input",
  disabled = false,
  initial = [],
}: {
  stage?: "input" | "output";
  disabled?: boolean;
  initial?: ContentRule[];
}) {
  const [rules, setRules] = useState(initial);
  return (
    <ContentRules
      stage={stage}
      rules={rules}
      onChange={setRules}
      disabled={disabled}
      token="fixture-token"
      endpoint="/scope/guardrails"
    />
  );
}

describe("local content controls", () => {
  it("tests draft presets with synthetic text and invalidates the result after sample changes", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({
          outcome: "allowed",
          reason: "inspected_text",
          redacted: true,
          synthetic: true,
          enforcement: false,
          mode: "buffered_full",
          coverage: "local_text",
        });
      }),
    );
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Email addresses" }));
    await user.type(
      screen.getByRole("textbox", { name: "Sample text" }),
      "fixture@example.test",
    );
    await user.click(screen.getByRole("button", { name: "Test patterns" }));
    await screen.findByText("Allowed after redaction");
    expect(calls).toEqual([
      {
        url: "/scope/guardrails/input-preview",
        body: {
          protocol: "chat",
          rules: [{ preset: "email_v1", action: "redact" }],
          request: {
            messages: [{ role: "user", content: "fixture@example.test" }],
          },
        },
      },
    ]);
    await user.type(
      screen.getByRole("textbox", { name: "Sample text" }),
      " changed",
    );
    expect(screen.queryByText("Allowed after redaction")).toBeNull();
  });
  it.each(["input", "output"] as const)("tests the Niu-key preset with its selected action at the %s stage", async stage => {
    const calls: Array<{url: string; body: unknown}> = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init?: RequestInit) => {
      calls.push({url: String(input), body: JSON.parse(String(init?.body))});
      return Response.json({outcome: "blocked", reason: "pattern_denial", redacted: false, synthetic: true, enforcement: false, mode: "buffered_full", coverage: "local_text"});
    }));
    render(<Harness stage={stage} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", {name: "Niu API keys"}));
    await user.click(screen.getByRole("button", {name: "Niu API keys action"}));
    await user.click(await screen.findByRole("menuitemradio", {name: "Block", exact: true}));
    await user.type(screen.getByRole("textbox", {name: "Sample text"}), "synthetic key test");
    await user.click(screen.getByRole("button", {name: "Test patterns"}));
    await screen.findByText("Blocked");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`/scope/guardrails/${stage}-preview`);
    expect(calls[0].body).toMatchObject({rules: [{preset: "niu_api_key_v1", action: "block"}]});
    await user.click(screen.getByRole("checkbox", {name: "Niu API keys"}));
    expect(screen.queryByRole("button", {name: "Niu API keys action"})).toBeNull();
    expect(screen.queryByText("Blocked")).toBeNull();
  });

  it("allows adding, changing and removing a custom pattern without a native select", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add pattern" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Pattern 1 regex" }));
    expect(
      screen.getByRole("button", { name: "Test patterns" }),
    ).toHaveProperty("disabled", true);
    await user.type(
      screen.getByRole("textbox", { name: "Pattern 1 regex" }),
      "fixture-secret",
    );
    await user.click(screen.getByRole("button", { name: "Pattern 1 action" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Block", exact: true }),
    );
    expect(
      screen.getByRole("button", { name: "Pattern 1 action" }).textContent,
    ).toContain("Block");
    await user.click(screen.getByRole("button", { name: "Remove pattern 1" }));
    expect(
      screen.queryByRole("textbox", { name: "Pattern 1 regex" }),
    ).toBeNull();
    expect(document.querySelector("select")).toBeNull();
  });
  it("constructs complete output fixtures and excludes unsupported Embeddings tests", async () => {
    let body: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return Response.json({
          outcome: "blocked",
          reason: "pattern_denial",
          redacted: false,
          synthetic: true,
          enforcement: false,
          mode: "buffered_full",
          coverage: "local_text",
        });
      }),
    );
    render(
      <Harness
        stage="output"
        initial={[{ pattern: "fixture-secret", action: "block" }]}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Test protocol" }));
    expect(
      screen.queryByRole("menuitemradio", { name: "Embeddings" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("menuitemradio", { name: "Responses", exact: true }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Sample text" }),
      "fixture-secret",
    );
    await user.click(screen.getByRole("button", { name: "Test patterns" }));
    await screen.findByText("Blocked");
    expect(body).toEqual({
      mode: "buffered_full",
      protocol: "responses",
      rules: [{ pattern: "fixture-secret", action: "block" }],
      response: {
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              { type: "output_text", text: "fixture-secret", annotations: [] },
            ],
          },
        ],
      },
    });
  });
  it("keeps saved rules read-only while allowing a reader to test synthetic text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          outcome: "allowed",
          reason: "inspected_text",
          redacted: false,
          synthetic: true,
          enforcement: false,
          mode: "buffered_full",
          coverage: "local_text",
        }),
      ),
    );
    render(
      <Harness disabled initial={[{ preset: "email_v1", action: "block" }]} />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Email addresses" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Email addresses action" }),
    ).toHaveProperty("disabled", true);
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("textbox", { name: "Sample text" }),
      "ordinary text",
    );
    await user.click(screen.getByRole("button", { name: "Test patterns" }));
    await screen.findByText("Allowed without redaction");
  });
  it("does not display stale results when an in-flight test is superseded", async () => {
    let resolve: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    render(<Harness initial={[{ pattern: "x", action: "block" }]} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Sample text" }), "x");
    await user.click(screen.getByRole("button", { name: "Test patterns" }));
    await user.type(
      screen.getByRole("textbox", { name: "Sample text" }),
      "changed",
    );
    resolve(
      Response.json({
        outcome: "blocked",
        reason: "pattern_denial",
        redacted: false,
        synthetic: true,
        enforcement: false,
        mode: "buffered_full",
        coverage: "local_text",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Test patterns" }),
      ).toHaveProperty("disabled", false),
    );
    expect(screen.queryByText("Blocked")).toBeNull();
  });
  it("validates byte bounds and mutually exclusive pattern sources", () => {
    expect(
      contentRulesError([{ pattern: "é".repeat(2049), action: "block" }]),
    ).not.toBe("");
    expect(
      contentRulesError([
        { pattern: "x", preset: "email_v1", action: "block" },
      ]),
    ).not.toBe("");
    expect(
      contentRulesError(Array(33).fill({ pattern: "x", action: "block" })),
    ).not.toBe("");
    expect(contentRulesError([{ pattern: " ", action: "block" }])).toBe("");
  });
});

it("never reports an empty or malformed preview response as an allowed test", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({})),
  );
  render(<Harness initial={[{ pattern: "x", action: "block" }]} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Sample text" }), "x");
  await user.click(screen.getByRole("button", { name: "Test patterns" }));
  await screen.findByText("Invalid synthetic test response.");
  expect(screen.queryByText("Allowed without redaction")).toBeNull();
});

it("preserves an unknown inspection cause without inventing unsupported-content coverage", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        outcome: "indeterminate",
        reason: "new_reason",
        redacted: false,
        synthetic: true,
        enforcement: false,
      }),
    ),
  );
  render(<Harness initial={[{ pattern: "x", action: "block" }]} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Sample text" }), "x");
  await user.click(screen.getByRole("button", { name: "Test patterns" }));
  await screen.findByText("Not fully inspectable (inspection incomplete)");
  expect(screen.queryByText("new_reason")).toBeNull();
});

it("previews observation without claiming redaction", async () => {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_url, init?: RequestInit) => { body=JSON.parse(String(init?.body)); return Response.json({outcome:"matched",reason:"pattern_match",redacted:false,synthetic:true,enforcement:false,mode:"observe_only",coverage:"local_text"}); }));
  render(<ContentRules stage="output" outputMode="observe_only" rules={[{pattern:"fixture",action:"redact"}]} onChange={()=>{}} disabled={false} token="fixture" endpoint="/guardrails" />);
  const user=userEvent.setup();
  await user.type(screen.getByRole("textbox",{name:"Sample text"}),"fixture");
  await user.click(screen.getByRole("button",{name:"Test patterns"}));
  await screen.findByText("Match observed · response unchanged");
  expect(body).toMatchObject({mode:"observe_only"});
  expect(screen.queryByText("Allowed after redaction")).toBeNull();
});
