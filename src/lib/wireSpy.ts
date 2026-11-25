import type { WireEntry } from "./types";

const entries: WireEntry[] = [];
const listeners = new Set<() => void>();
let installed = false;
let seq = 0;

function notify() {
  for (const fn of listeners) fn();
}

export function installWireSpy(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    // Observe only actual external/HTTP(S) network traffic (ignore local data:, blob:, and Vite local dev paths)
    const isRemoteHttp = /^https?:\/\//i.test(url) && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(url);

    let bodyText = "";
    if (init?.body) {
      if (typeof init.body === "string") {
        bodyText = init.body;
      } else {
        try {
          bodyText = String(init.body);
        } catch {
          bodyText = "[non-string body]";
        }
      }
    }

    if (isRemoteHttp) {
      seq += 1;
      entries.push({
        id: `wire-${seq}`,
        ts: new Date().toISOString(),
        url,
        method: init?.method || "GET",
        bodyLength: bodyText.length,
        bodyText
      });
      notify();
    }

    return nativeFetch(input, init);
  };
}

export function getWireCount(): number {
  return entries.length;
}

export function getWireSlice(fromIndex: number): WireEntry[] {
  return entries.slice(fromIndex);
}

export function getAllWireEntries(): WireEntry[] {
  return [...entries];
}

export function clearWireEntries(): void {
  entries.length = 0;
  notify();
}

export function subscribeWire(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
