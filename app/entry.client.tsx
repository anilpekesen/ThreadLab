import { RemixBrowser } from "@remix-run/react";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

// When a new deploy changes asset hashes, SPA navigation tries to load
// old chunk filenames that no longer exist → blank page.
// Force a full reload on any unhandled chunk-load error.
window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message ?? "";
  if (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  ) {
    window.location.reload();
  }
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>
  );
});
