import type { WireChannel, WireEntry } from "./types";

const entries: WireEntry[] = [];
const listeners = new Set<() => void>();
let installed = false;
let seq = 0;

// Scoped tagging for concurrent/sequential wire inspection
let currentChannel: WireChannel = "cleave_production";
let currentCaseLabel: string | undefined;

function notify() {
  for (const fn of listeners) fn();
}

export async function withWireContext<T>(
  channel: WireChannel,
  caseLabel: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const prevChannel = currentChannel;
  const prevLabel = currentCaseLabel;
  currentChannel = channel;
  currentCaseLabel = caseLabel;
  try {
    return await fn();
  } finally {
    currentChannel = prevChannel;
    currentCaseLabel = prevLabel;
  }
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

    const isRemoteHttp =
      /^https?:\/\//i.test(url) && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(url);

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
        bodyText,
        channel: currentChannel,
        caseLabel: currentCaseLabel
      });
      notify();
    }

    return nativeFetch(input, init);
  };
}

export function annotateWireEntries(entryIds: string[], leakedValues: string[]): void {
  const idSet = new Set(entryIds);
  for (const e of entries) {
    if (idSet.has(e.id)) {
      e.leakedValues = leakedValues;
    }
  }
  notify();
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
