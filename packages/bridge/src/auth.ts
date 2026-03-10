export interface AuthConfig {
  allowedNumbers: string[];
  rateLimit: { maxPerHour: number; burstMax: number };
}

export class AuthGuard {
  private allowedNumbers: Set<string>;
  private rateLimit: AuthConfig["rateLimit"];
  private hourlyCounters = new Map<string, { count: number; resetAt: number }>();

  constructor(config: AuthConfig) {
    this.allowedNumbers = new Set(config.allowedNumbers);
    this.rateLimit = config.rateLimit;
  }

  isAllowed(phoneNumber: string): boolean {
    return this.allowedNumbers.has(phoneNumber);
  }

  checkRateLimit(phoneNumber: string): boolean {
    const now = Date.now();
    let entry = this.hourlyCounters.get(phoneNumber);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + 3600_000 };
      this.hourlyCounters.set(phoneNumber, entry);
    }

    if (entry.count >= this.rateLimit.maxPerHour) return false;
    entry.count++;
    return true;
  }
}
