"use client";

import { useEffect, useState } from "react";

export default function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // A new SW is already waiting (and we have a controller = it's an update)
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);

        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            // Installed while a controller exists → this is an UPDATE, not first install
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(nw);
            }
          });
        });
      })
      .catch(() => {});

    // When the new SW takes control, reload once to pick up fresh assets
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }, []);

  if (!waiting) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-4 rounded-full bg-slate-900 text-white pl-5 pr-2 py-2 shadow-xl">
      <span className="text-[13px]">A new version is available.</span>
      <button
        onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}
        className="rounded-full bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-[13px] font-semibold px-4 py-1.5 transition-colors"
      >
        Reload
      </button>
    </div>
  );
}
