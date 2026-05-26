// Server-only: convert Claude token usage into a Rand cost for metering.
// Prices are kept here (never shipped to the client) so the UI can stay
// percentage-only.

const USD_TO_ZAR = 18.5;

interface Rates {
  in: number;          // per token, USD
  out: number;
  cacheWrite: number;
  cacheRead: number;
}

// Per-token USD rates (per-million ÷ 1e6).
const RATES: Record<string, Rates> = {
  "claude-sonnet-4-5": { in: 3 / 1e6,  out: 15 / 1e6, cacheWrite: 3.75 / 1e6,  cacheRead: 0.30 / 1e6 },
  "claude-opus-4-5":   { in: 15 / 1e6, out: 75 / 1e6, cacheWrite: 18.75 / 1e6, cacheRead: 1.50 / 1e6 },
};

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function costZar(model: string, usage: TokenUsage): number {
  const r = RATES[model] ?? RATES["claude-sonnet-4-5"];
  const usd =
    (usage.input_tokens ?? 0) * r.in +
    (usage.output_tokens ?? 0) * r.out +
    (usage.cache_creation_input_tokens ?? 0) * r.cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * r.cacheRead;
  return usd * USD_TO_ZAR;
}
