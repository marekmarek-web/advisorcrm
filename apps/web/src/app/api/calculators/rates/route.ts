import { NextResponse } from "next/server";
import { getLoanRates, getMortgageRates } from "@/lib/calculators/mortgage/rates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  const rates = type === "loan" ? await getLoanRates() : await getMortgageRates();

  return NextResponse.json(
    {
      ok: true,
      rates,
      type: type === "loan" ? "loan" : "mortgage",
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    }
  );
}
