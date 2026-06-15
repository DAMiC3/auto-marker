// Server-only: convert Claude token usage into a Rand cost for metering.
// Prices are kept here (never shipped to the client) so the UI can stay
// percentage-only.

export const USD_TO_ZAR = 18.5;

export interface Rates {
  in: number;          // per token, USD
  out: number;
  cacheWrite: number;
  cacheRead: number;
}

// Standard API rates (per-token USD, per-million ÷ 1e6).
const RATES: Record<string, Rates> = {
  "claude-sonnet-4-6": { in: 3 / 1e6,  out: 15 / 1e6, cacheWrite: 3.75 / 1e6,  cacheRead: 0.30 / 1e6 },
  "claude-opus-4-7":   { in: 15 / 1e6, out: 75 / 1e6, cacheWrite: 18.75 / 1e6, cacheRead: 1.50 / 1e6 },
};

// Message Batches API: 50% discount on all token types vs standard rates.
export const BATCH_RATES: Record<string, Rates> = {
  "claude-sonnet-4-6": { in: 1.5 / 1e6,  out: 7.5 / 1e6,  cacheWrite: 1.875 / 1e6, cacheRead: 0.15 / 1e6 },
  "claude-opus-4-7":   { in: 7.5 / 1e6,  out: 37.5 / 1e6, cacheWrite: 9.375 / 1e6, cacheRead: 0.75 / 1e6 },
};

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

function calc(r: Rates, usage: TokenUsage): number {
  const usd =
    (usage.input_tokens ?? 0) * r.in +
    (usage.output_tokens ?? 0) * r.out +
    (usage.cache_creation_input_tokens ?? 0) * r.cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * r.cacheRead;
  return usd * USD_TO_ZAR;
}

// Standard API — use for instant marking costs.
export function costZar(model: string, usage: TokenUsage): number {
  return calc(RATES[model] ?? RATES["claude-sonnet-4-6"], usage);
}

// Batch API — use when recording real batch job costs (Anthropic bills 50% less for batches).
export function costZarBatch(model: string, usage: TokenUsage): number {
  return calc(BATCH_RATES[model] ?? BATCH_RATES["claude-sonnet-4-6"], usage);
}
