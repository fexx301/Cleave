import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfTextFromBytes } from "../src/lib/pdf";
import { detectPlanIdCue, verifyCustomEocSafety } from "../src/lib/gate";

describe("Client-side PDF extraction (pdfjs-dist) & Custom EOC safety guard", () => {
  it("extracts selectable text locally from the real sample denial PDF", async () => {
    const pdfPath = path.resolve(process.cwd(), "public/samples/case1-after-hours-denial.pdf");
    const bytes = new Uint8Array(fs.readFileSync(pdfPath));
    const expectedBytes = bytes.byteLength;
    const res = await extractPdfTextFromBytes(bytes, "case1-after-hours-denial.pdf");

    expect(res.pageCount).toBe(1);
    expect(res.byteLength).toBe(expectedBytes);
    expect(res.byteLength).toBeGreaterThan(1000);
    expect(res.text).toContain("Elena Vasquez");
    expect(res.text).toContain("MBR-8841209");
    expect(res.text).toContain("CLM-2026-991042");
    expect(res.text).toContain("PLAN-HMO-2026-GOLD");
    expect(res.text).toContain("11:40 PM");

    // Verify that if a user accidentally drops this personal denial PDF into the Custom EOC slot, code refuses it!
    const safety = verifyCustomEocSafety(res.text);
    expect(safety.ok).toBe(false);
    if (!safety.ok) {
      expect(safety.refusal).toBe("REFUSE_RESIDUAL_IDENTIFIER");
    }
  });

  it("extracts selectable text locally from the real custom Plan EOC PDF and clears safety guard", async () => {
    const pdfPath = path.resolve(process.cwd(), "public/samples/sample-custom-eoc.pdf");
    const bytes = new Uint8Array(fs.readFileSync(pdfPath));
    const expectedBytes = bytes.byteLength;
    const res = await extractPdfTextFromBytes(bytes, "sample-custom-eoc.pdf");

    expect(res.pageCount).toBe(1);
    expect(res.byteLength).toBe(expectedBytes);
    expect(res.text).toContain("PLAN-PPO-2026-SUMMIT");
    expect(detectPlanIdCue(res.text)).toBe("PLAN-PPO-2026-SUMMIT");
    expect(res.text).toContain("Section 7.3(a)");
    expect(res.text).toContain("Section 9.2(c)");

    const safety = verifyCustomEocSafety(res.text);
    expect(safety.ok).toBe(true);
  });
});
