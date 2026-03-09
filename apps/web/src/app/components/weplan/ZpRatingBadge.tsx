"use client";

import { useState } from "react";
import {
  findRatingByPartnerName,
  getEucsRatingForProduct,
  ZP_RATING_DISCLAIMER,
  EUCS_ZP_DISCLAIMER,
  type InsuranceRating,
} from "@/data/insurance-ratings";

interface ZpRatingBadgeProps {
  partnerName: string;
  productName?: string | null;
  segment: string;
}

function RatingPopover({ rating, onClose }: { rating: InsuranceRating; onClose: () => void }) {
  const pct = Math.round((rating.totalScore / rating.maxTotalScore) * 100);
  return (
    <div
      className="absolute z-50 left-0 top-full mt-1 w-[280px] bg-monday-surface border border-monday-border rounded-lg shadow-lg p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold text-monday-text">{rating.partnerName}</span>
        <button type="button" onClick={onClose} className="text-monday-text-muted text-[11px] hover:text-monday-text">&#x2715;</button>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[20px] font-bold text-monday-blue">{rating.totalScore}</div>
        <div className="text-[11px] text-monday-text-muted">/ {rating.maxTotalScore} ({pct}%)</div>
      </div>
      <div className="space-y-1.5 mb-3">
        {rating.categories.map((cat) => (
          <div key={cat.name}>
            <div className="flex justify-between text-[11px] text-monday-text mb-0.5">
              <span>{cat.name}</span>
              <span className="text-monday-text-muted">{cat.score}/{cat.maxScore}</span>
            </div>
            <div className="h-1.5 rounded-full bg-monday-border overflow-hidden">
              <div
                className="h-full rounded-full bg-monday-blue"
                style={{ width: `${(cat.score / cat.maxScore) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-monday-text-muted italic leading-tight">
        {ZP_RATING_DISCLAIMER}
      </p>
    </div>
  );
}

export function ZpRatingBadge({ partnerName, productName, segment }: ZpRatingBadgeProps) {
  const [open, setOpen] = useState(false);

  if (segment !== "ZP" || !partnerName) return null;

  const eucs = productName ? getEucsRatingForProduct(partnerName, productName) : undefined;
  const rating = findRatingByPartnerName(partnerName);

  if (!eucs && !rating) return null;

  if (eucs) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-monday-blue"
        data-tip={`EUCS (${eucs.as_of}): ${EUCS_ZP_DISCLAIMER}`}
      >
        &#x2605; {eucs.rating_total}
      </span>
    );
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-monday-blue hover:bg-blue-100 transition-colors"
        data-tip="Zobrazit informativní rating. Klikněte pro detail."
      >
        &#x2605; {rating!.totalScore}
      </button>
      {open && <RatingPopover rating={rating!} onClose={() => setOpen(false)} />}
    </span>
  );
}
