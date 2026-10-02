import "@/lib/i18n"; // first: initialize translations before any component renders
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { registerServiceWorker } from "@/features/account/push";
import "@/app/index.css";

// For push reminders; harmless where unsupported.
void registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
