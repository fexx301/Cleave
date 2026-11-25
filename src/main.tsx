import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installWireSpy } from "./lib/wireSpy";
import "./styles/cleave.css";
import App from "./App";

// Install read-only fetch wire spy before mounting so every outbound HTTPS byte is observable
installWireSpy();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
