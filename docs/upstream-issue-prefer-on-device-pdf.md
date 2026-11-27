<!-- Draft for firebase/firebase-js-sdk (template: bug_report_v2). Not posted. -->

**Title:** AI: PREFER_ON_DEVICE silently sends unsupported inlineData (e.g. application/pdf) to the cloud even when Gemini Nano is available

---

### Operating System

macOS 27.2

### Environment (if applicable)

Google Chrome 158.0.8127.38 (desktop), Gemini Nano downloaded; `LanguageModel.availability()` returns `"available"`.

### Firebase SDK Version

12.19.0 (`@firebase/ai` 2.16.0)

### Firebase SDK Product(s)

AI

### Project Tooling

Vite + React + TypeScript web app, Firebase Hosting, App Check (reCAPTCHA Enterprise).

### Detailed Problem Description

With `InferenceMode.PREFER_ON_DEVICE`, a request whose `inlineData` has a MIME type outside `ChromeAdapterImpl.SUPPORTED_MIME_TYPES` (`image/jpeg`, `image/png`) is sent to the cloud model **even when the on-device model is available**. The only signal is a `logger.debug` line:

```
Unsupported mime type "application/pdf" rejected for on-device inference.
On-device inference unavailable because request is incompatible.
```

`isAvailable()` returns `false` for the request because `ChromeAdapterImpl.isOnDeviceRequest()` rejects it, and `callCloudOrDevice()` then calls `inCloudCall()`, which uploads the full Base64 file.

The reference docs for `InferenceMode` say PREFER_ON_DEVICE falls back to the cloud "if on-device inference is not available". That reads as a device-level condition (no model, not downloaded, unsupported browser). It is also decided **per request** by the input type, which the docs don't mention.

Why this matters: developers choose PREFER_ON_DEVICE for sensitive inputs exactly because they want them processed locally when possible. A PDF of a medical letter, contract or bank statement is a common input, and it goes to the cloud on every call, on a device where Gemini Nano is ready, with nothing above debug level to say so. `response.inferenceSource === "in_cloud"` reveals it, but only after the upload.

For contrast, `ONLY_ON_DEVICE` does not run `isOnDeviceRequest()`. The same request goes to Chrome's Prompt API and fails locally (`The source image could not be decoded.`) with 0 network requests, which is the behaviour a privacy-sensitive app wants.

### Steps and code to reproduce issue

1. Desktop Chrome with Gemini Nano available (`await LanguageModel.availability()` → `"available"`).
2. Run:

```ts
import { initializeApp } from "firebase/app";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";

const app = initializeApp(firebaseConfig);
const ai = getAI(app, { backend: new GoogleAIBackend() });

// Any real PDF. (A hand-made minimal PDF also reproduces the upload, but the server then
// rejects it, so generateContent throws after the request has already been sent.)
const bytes = new Uint8Array(await (await fetch("/sample.pdf")).arrayBuffer());
const pdfBase64 = btoa(String.fromCharCode(...bytes));
const prompt = [
  { text: "Summarize this letter in 10 words." },
  { inlineData: { mimeType: "application/pdf", data: pdfBase64 } }
];

const model = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE });
const result = await model.generateContent(prompt);
console.log(result.response.inferenceSource); // "in_cloud"
```

3. In DevTools → Network, the `generateContent` request body contains the Base64 PDF.

**Expected:** at least one of:
- the docs for `PREFER_ON_DEVICE` (and the hybrid inference guide) state that requests the on-device model can't handle, such as unsupported `inlineData` MIME types, function responses or empty prompts, are routed to the cloud even when the on-device model is available;
- the fallback for an incompatible request is logged at `warn` rather than `debug`;
- an opt-out, e.g. an option that makes PREFER_ON_DEVICE throw for incompatible requests instead of falling back, so apps can keep "on-device first, cloud only when the device can't" without unsupported inputs leaving silently.

**Actual:** the PDF is uploaded to the cloud with only a debug-level log.

Related: #10635 (ONLY_ON_DEVICE falls back to the cloud when the `LanguageModel` API is missing).

We found this building a privacy-first app on Firebase AI Logic hybrid inference; a live side-by-side (ONLY_ON_DEVICE: 0 requests; PREFER_ON_DEVICE: raw PDF on the wire) is in the app's Fail-Closed PDF Lab: https://cleave-5a82b.web.app (Proof → Fail-Closed PDF Lab).
