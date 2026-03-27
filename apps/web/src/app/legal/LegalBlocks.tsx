import type { ReactNode } from "react";

export type LegalBlock = { type: "h1" | "p" | "li"; text: string };

function stripLeadingBullet(text: string) {
  return text.replace(/^[\d]+\.\s*/, "").replace(/^•\s*/, "").trim();
}

export function LegalBlocks({ blocks }: { blocks: LegalBlock[] }) {
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === "li") {
      const items: LegalBlock[] = [];
      while (i < blocks.length && blocks[i].type === "li") {
        items.push(blocks[i]);
        i++;
      }
      nodes.push(
        <ul
          key={`ul-${key++}`}
          className="list-disc space-y-2 pl-5 text-sm text-gray-800 dark:text-gray-200"
        >
          {items.map((it, j) => (
            <li key={j}>{stripLeadingBullet(it.text)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (b.type === "h1") {
      nodes.push(
        <h2
          key={`h-${key++}`}
          id={`sec-${slugifyHeading(b.text)}`}
          className="scroll-mt-24 text-lg font-semibold text-gray-900 dark:text-white mt-10 first:mt-0"
        >
          {b.text}
        </h2>
      );
    } else {
      nodes.push(
        <p key={`p-${key++}`} className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 mt-3">
          {b.text}
        </p>
      );
    }
    i++;
  }

  return <div className="space-y-1">{nodes}</div>;
}

function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
