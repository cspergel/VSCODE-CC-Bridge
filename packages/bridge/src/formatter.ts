import { Classification, DEFAULTS } from "@live-bridge/shared";

export interface FormatInput {
  classification: Classification;
  text: string;
  sessionName: string;
  multiSession: boolean;
  actions?: string[];
  maxLength?: number;
}

export function formatForWhatsApp(input: FormatInput): string {
  const maxLen = input.maxLength ?? DEFAULTS.MAX_WA_MESSAGE_LENGTH;
  const lines: string[] = [];

  // Session tag (only in multi-session mode)
  if (input.multiSession) {
    lines.push(`[${input.sessionName}]`);
  }

  // Classification-specific formatting
  switch (input.classification) {
    case Classification.Status:
      lines.push(`📡 ${input.text}`);
      break;

    case Classification.Decision:
      lines.push(`⚠️ DECISION REQUIRED`);
      lines.push("");
      lines.push(input.text);
      if (input.actions?.length) {
        lines.push("");
        for (let i = 0; i < input.actions.length; i++) {
          lines.push(`${i + 1}. ${input.actions[i]}`);
        }
        lines.push("");
        lines.push("Reply with number to choose.");
      }
      break;

    case Classification.Error:
      lines.push(`❌ ERROR`);
      lines.push("");
      lines.push(input.text);
      break;

    case Classification.Output:
    default:
      lines.push(input.text);
      break;
  }

  let result = lines.join("\n").trim();

  // Truncate if exceeding max length
  if (result.length > maxLen) {
    result = result.slice(0, maxLen - 20) + "\n\n... (truncated)";
  }

  return result;
}
