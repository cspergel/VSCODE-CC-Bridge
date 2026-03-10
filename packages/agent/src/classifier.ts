export { Classification } from "@live-bridge/shared";
import { Classification } from "@live-bridge/shared";

const STATUS_PATTERNS = [
  /^(Reading|Searching|Analyzing|Loading|Scanning|Compiling|Indexing)\b/i,
  /^\s*(\||\\|\/|-)\s*$/,
  /^(\d+)\/(\d+) (files|tests|modules)/,
  /^\.\.\.$/,
];

const DECISION_PATTERNS = [
  /\?\s*$/,
  /\b(proceed|confirm|apply|approve|accept|continue)\b.*\?/i,
  /\b(y\/n|yes\/no)\b/i,
  /\b(should I|shall I|do you want|would you like)\b/i,
  /^(Run|Execute|Create|Delete|Modify)\b.*\?/i,
];

const ERROR_PATTERNS = [
  /^(Error|ERROR|FATAL|Exception|Traceback|panic):/,
  /^\s+at\s+/,
  /^(npm ERR!|SyntaxError|TypeError|ReferenceError)/,
  /exit code [1-9]/i,
];

export function classify(text: string): Classification {
  const trimmed = text.trim();
  const firstLine = trimmed.split("\n")[0];

  // ERROR — check all lines, first line priority
  for (const p of ERROR_PATTERNS) {
    if (p.test(firstLine) || p.test(trimmed) || p.test(text)) return Classification.Error;
  }

  // DECISION — check full text
  for (const p of DECISION_PATTERNS) {
    if (p.test(trimmed)) return Classification.Decision;
  }

  // STATUS — first line only
  for (const p of STATUS_PATTERNS) {
    if (p.test(firstLine)) return Classification.Status;
  }

  // Default: OUTPUT
  return Classification.Output;
}
