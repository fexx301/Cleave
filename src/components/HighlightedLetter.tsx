import React from "react";
import type { IdentityVault } from "../lib/types";

interface Props {
  text: string;
  vault: IdentityVault | null;
}

/**
 * Renders the local denial letter and underlines every locally-extracted identity span
 * strictly inside browser memory so the user can see exactly what stays on device.
 */
export function HighlightedLetter({ text, vault }: Props) {
  if (!vault) {
    return <div className="letter-box">{text || "Paste a denial letter or load a sample case above."}</div>;
  }

  const entries: Array<{ key: string; value: string }> = Object.entries(vault)
    .filter(([, v]) => typeof v === "string" && v.trim().length >= 3)
    .map(([key, v]) => ({ key, value: (v as string).trim() }))
    .sort((a, b) => b.value.length - a.value.length);

  if (entries.length === 0) {
    return <div className="letter-box">{text}</div>;
  }

  const escaped = entries.map((e) => e.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);

  const labelFor = (fragment: string): string | null => {
    const low = fragment.toLowerCase();
    const match = entries.find((e) => e.value.toLowerCase() === low);
    return match ? match.key.replace(/_alt$/, "") : null;
  };

  return (
    <div className="letter-box" aria-label="Local denial letter with on-device identifiers highlighted">
      {parts.map((part, idx) => {
        const key = labelFor(part);
        if (!key) return <React.Fragment key={idx}>{part}</React.Fragment>;
        return (
          <mark
            key={idx}
            className="vault-highlight"
            title={`Held strictly on-device in Local Vault (${key})`}
          >
            {part}
          </mark>
        );
      })}
    </div>
  );
}
