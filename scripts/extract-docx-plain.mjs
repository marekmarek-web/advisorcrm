import fs from "node:fs";

const xmlPath = process.argv[2];
if (!xmlPath) {
  console.error("Usage: node extract-docx-plain.mjs path/to/word/document.xml");
  process.exit(1);
}
const xml = fs.readFileSync(xmlPath, "utf8");
const paras = xml.split("<w:p").slice(1).map((block) => {
  const texts = [];
  const re = /<w:t[^>]*(?:xml:space="preserve")?[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(block)) !== null) texts.push(m[1]);
  return texts.join("");
});
const out = paras.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n\n");
const outPath = process.argv[3];
if (outPath) fs.writeFileSync(outPath, out, "utf8");
else process.stdout.write(out);
