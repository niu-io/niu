/** Transport completion does not establish that the model finished its answer. */
export function generationOutcome(reason?: string | null): {label: string; detail: string | null} {
  switch (reason) {
    case 'stop': return {label: 'Complete', detail: null};
    case 'length': return {label: 'Output limit reached', detail: 'The answer may be incomplete. Increase the output limit in chat settings before generating again.'};
    case 'content_filter': return {label: 'Output filtered', detail: 'The model’s safety filter stopped this response. Review your request before trying again.'};
    case 'tool_calls':
    case 'function_call': return {label: 'Tool action required', detail: 'The model requested a tool action. This chat does not execute tool calls.'};
    default: return {label: 'Response ended', detail: 'The model’s completion reason is unavailable. Check the answer before relying on it.'};
  }
}
