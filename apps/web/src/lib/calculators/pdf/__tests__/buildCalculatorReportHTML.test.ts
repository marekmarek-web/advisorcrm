import { describe, expect, it } from "vitest";
import { buildCalculatorReportHTML } from "../buildCalculatorReportHTML";
import { CALCULATOR_PDF_DISCLAIMER_LINES } from "../format";

describe("buildCalculatorReportHTML", () => {
  it("wraps document in calc-export-report and uses table.dt", () => {
    const html = buildCalculatorReportHTML({
      documentTitle: "Test <report>",
      eyebrow: "Eyebrow",
      subtitle: "Sub",
      sections: [
        { title: "Sekce A", rows: [{ label: "x", value: "1" }] },
      ],
      disclaimerLines: CALCULATOR_PDF_DISCLAIMER_LINES,
      theme: "elegant",
      branding: { advisorName: "Jan" },
      heroKpis: [{ label: "KPI", value: "v" }],
    });
    expect(html).toContain("calc-export-report");
    expect(html).toContain('table class="dt"');
    expect(html).toContain("Test &lt;report&gt;");
    expect(html).not.toContain("<report>");
  });
});
