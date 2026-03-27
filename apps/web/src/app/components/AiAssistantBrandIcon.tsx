"use client";

import type { CSSProperties } from "react";
import clsx from "clsx";

export const AI_ASSISTANT_BRAND_LOGO_SRC = "/logos/Ai%20button.png";

type Props = {
  /** Výška loga (šířka se řídí poměrem obrázku — není to vynucený čtverec). */
  size?: number;
  className?: string;
  /** Lucide-compatible; ignored — for drop-in nav items */
  strokeWidth?: number;
  /**
   * `default`: světlý režim = barevné „Ai“ (screen sloučí černé pozadí PNG s podkladem);
   * tmavý režim = bílá silueta přes luminance masku (bez černého čtverce).
   * `blendOnly`: jen mix-blend-screen — hodí se na bílé kulaté tlačítko, kde bílá maska zmizí.
   */
  variant?: "default" | "blendOnly";
};

/**
 * Brand mark „Ai“ pro AI asistenta / AI Review (nahrazuje Sparkles).
 * PNG má černé pozadí — v default variantě se na světlém odstraní přes screen,
 * v dark přes masku jako bílé písmeno bez rámečku.
 */
export function AiAssistantBrandIcon({ size = 24, className, variant = "default" }: Props) {
  const src = AI_ASSISTANT_BRAND_LOGO_SRC;
  const h = size;

  const maskStyle: CSSProperties = {
    height: h,
    width: h,
    maskImage: `url("${src}")`,
    WebkitMaskImage: `url("${src}")`,
    maskSize: "contain",
    WebkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
    maskMode: "luminance",
  };

  if (variant === "blendOnly") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small static brand asset
      <img
        src={src}
        alt=""
        className={clsx(
          "inline-block shrink-0 object-contain object-center mix-blend-screen",
          className,
        )}
        style={{ height: h, width: "auto", maxHeight: h }}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center leading-none", className)}
      style={{ height: h }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
      <img
        src={src}
        alt=""
        className="h-full w-auto max-h-full object-contain object-center mix-blend-screen dark:hidden"
        style={{ height: h, width: "auto" }}
        aria-hidden
      />
      <span aria-hidden className="hidden shrink-0 bg-white dark:block" style={maskStyle} />
    </span>
  );
}
