// First-login onboarding prompt — shown once, then never again on this device.
// Device-local like the rest of Settings (see docs/categories/03-ui.md §9); it isn't
// synced across devices, matching how settings/accent already behave.
const KEY = "automark.onboardingSeen";

export function hasSeenOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // storage unavailable — don't nag every load
  }
}

export function markOnboardingSeen() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}
