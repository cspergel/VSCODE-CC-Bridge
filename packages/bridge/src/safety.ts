const BLOCKLIST_PATTERNS = [
  /\brm\s+-rf\s+\//i,
  /\bsudo\b/i,
  /\bDROP\s+(TABLE|DATABASE)\b/i,
  /\bcurl\b.*\|\s*bash/i,
  /\bwget\b.*\|\s*bash/i,
  /\bssh-keygen\b/i,
  /\bcat\s+.*\.(pem|key)\b/i,
  /\bchmod\s+777\b/i,
];

const PIN_REQUIRED_PATTERNS = [
  /\bgit\s+push\s+--force\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bnpm\s+publish\b/i,
  /\bdeploy\b/i,
  /\bmigrat(e|ion)\b/i,
];

export class SafetyFilter {
  check(command: string): { blocked: boolean; reason: string | null } {
    for (const pattern of BLOCKLIST_PATTERNS) {
      if (pattern.test(command)) {
        return { blocked: true, reason: "blocklist" };
      }
    }
    return { blocked: false, reason: null };
  }

  needsPin(command: string): boolean {
    return PIN_REQUIRED_PATTERNS.some((p) => p.test(command));
  }
}
