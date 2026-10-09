export type ContentRule = {
  pattern?: string;
  preset?: "email_v1" | "api_key_prefix_v1" | "niu_api_key_v1";
  action: "block" | "redact";
};
export const presets = [
  { value: "email_v1", label: "Email addresses" },
  { value: "api_key_prefix_v1", label: "API key prefixes" },
  { value: "niu_api_key_v1", label: "Niu API keys" },
] as const;
export const actions = { block: "Block", redact: "Redact" };
export function contentRulesError(rules: ContentRule[]): string {
  if (rules.length > 32) return "At most 32 rules are supported per stage.";
  for (const rule of rules) {
    const pattern =
      typeof rule.pattern === "string" &&
      rule.pattern.length > 0 &&
      new TextEncoder().encode(rule.pattern).length <= 4096 &&
      rule.preset === undefined;
    const preset =
      rule.pattern === undefined &&
      presets.some((item) => item.value === rule.preset);
    if (!pattern && !preset)
      return "Choose a supported preset or enter a pattern of 1–4096 UTF-8 bytes.";
    if (!Object.hasOwn(actions, rule.action))
      return "Choose Block or Redact for each rule.";
  }
  return "";
}
