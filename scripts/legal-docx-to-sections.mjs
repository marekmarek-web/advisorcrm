/**
 * Extracts plain paragraphs from Word document.xml (UTF-8) for legal pages.
 * Output: JSON array of { type: "h1"|"p"|"li", text: string }
 */
import fs from "node:fs";

const xmlPath = process.argv[2];
const outPath = process.argv[3];
if (!xmlPath || !outPath) {
  console.error("Usage: node legal-docx-to-sections.mjs document.xml out.json");
  process.exit(1);
}

const xml = fs.readFileSync(xmlPath, "utf8");
const parts = xml.split("</w:p>");
const tRe = /<w:t[^>]*(?:xml:space="preserve")?[^>]*>([^<]*)<\/w:t>/g;

function paraText(block) {
  const texts = [];
  let m;
  while ((m = tRe.exec(block)) !== null) texts.push(m[1]);
  return texts.join("").replace(/\s+/g, " ").trim();
}

const out = [];
for (const part of parts) {
  const text = paraText(part);
  if (!text) continue;
  const isH1 = part.includes('w:val="Heading1"');
  const isBullet =
    part.includes("w:hanging") && (part.includes("•") || part.includes("1. ") || part.includes("2. "));
  if (isH1) out.push({ type: "h1", text });
  else if (isBullet && text.length < 400) out.push({ type: "li", text });
  else out.push({ type: "p", text });
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.error("Wrote", out.length, "blocks to", outPath);
