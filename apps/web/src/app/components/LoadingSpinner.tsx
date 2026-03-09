"use client";

import React from "react";

type Variant = "spinner" | "dots-pulse" | "dots-bounce" | "ring-dash" | "typing" | "orbit";
type Size = "sm" | "md" | "lg";

interface LoadingSpinnerProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  color?: string;
}

const sizePx: Record<Size, number> = { sm: 16, md: 28, lg: 44 };

const styles = `
@keyframes wp-ls-spin{to{transform:rotate(360deg)}}
@keyframes wp-ls-pulse{0%,100%{transform:scale(.6);opacity:.4}50%{transform:scale(1);opacity:1}}
@keyframes wp-ls-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-50%)}}
@keyframes wp-ls-dash{0%{stroke-dasharray:1,150;stroke-dashoffset:0}50%{stroke-dasharray:90,150;stroke-dashoffset:-35}100%{stroke-dasharray:90,150;stroke-dashoffset:-124}}
@keyframes wp-ls-typing{0%,60%,100%{transform:translateY(0);opacity:.3}30%{transform:translateY(-40%);opacity:1}}
@keyframes wp-ls-orbit{to{transform:rotate(360deg)}}
`;

function Spinner({ px, color }: { px: number; color: string }) {
  const border = Math.max(2, Math.round(px * 0.12));
  return (
    <div
      style={{
        width: px,
        height: px,
        border: `${border}px solid transparent`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "wp-ls-spin .7s linear infinite",
        boxSizing: "border-box",
      }}
    />
  );
}

function DotsPulse({ px, color }: { px: number; color: string }) {
  const dot = Math.round(px * 0.28);
  const gap = Math.round(px * 0.1);
  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      {[0, 0.15, 0.3].map((d) => (
        <div
          key={d}
          style={{
            width: dot,
            height: dot,
            borderRadius: "50%",
            backgroundColor: color,
            animation: `wp-ls-pulse .8s ${d}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

function DotsBounce({ px, color }: { px: number; color: string }) {
  const dot = Math.round(px * 0.28);
  const gap = Math.round(px * 0.1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap, height: px }}>
      {[0, 0.12, 0.24].map((d) => (
        <div
          key={d}
          style={{
            width: dot,
            height: dot,
            borderRadius: "50%",
            backgroundColor: color,
            animation: `wp-ls-bounce .6s ${d}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

function RingDash({ px, color }: { px: number; color: string }) {
  const stroke = Math.max(2, Math.round(px * 0.12));
  const r = (px - stroke) / 2;
  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${px} ${px}`}
      style={{ animation: "wp-ls-spin 1.4s linear infinite" }}
    >
      <circle
        cx={px / 2}
        cy={px / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        style={{ animation: "wp-ls-dash 1.4s ease-in-out infinite" }}
      />
    </svg>
  );
}

function Typing({ px, color }: { px: number; color: string }) {
  const dot = Math.round(px * 0.22);
  const gap = Math.round(px * 0.12);
  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      {[0, 0.2, 0.4].map((d) => (
        <div
          key={d}
          style={{
            width: dot,
            height: dot,
            borderRadius: "50%",
            backgroundColor: color,
            animation: `wp-ls-typing 1.2s ${d}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

function Orbit({ px, color }: { px: number; color: string }) {
  const dot = Math.round(px * 0.18);
  const radius = px / 2 - dot / 2;
  return (
    <div
      style={{
        position: "relative",
        width: px,
        height: px,
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: px,
            height: px,
            animation: `wp-ls-orbit 1.2s ${i * 0.15}s linear infinite`,
          }}
        >
          <div
            style={{
              width: dot,
              height: dot,
              borderRadius: "50%",
              backgroundColor: color,
              position: "absolute",
              top: px / 2 - radius - dot / 2,
              left: px / 2 - dot / 2,
              opacity: 1 - i * 0.25,
            }}
          />
        </div>
      ))}
    </div>
  );
}

const variants: Record<Variant, React.FC<{ px: number; color: string }>> = {
  spinner: Spinner,
  "dots-pulse": DotsPulse,
  "dots-bounce": DotsBounce,
  "ring-dash": RingDash,
  typing: Typing,
  orbit: Orbit,
};

export function LoadingSpinner({
  variant = "spinner",
  size = "md",
  className,
  color = "currentColor",
}: LoadingSpinnerProps) {
  const px = sizePx[size];
  const Comp = variants[variant];

  return (
    <span
      role="status"
      aria-label="Loading"
      className={className}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", color }}
    >
      <style>{styles}</style>
      <Comp px={px} color={color === "currentColor" ? "currentColor" : color} />
    </span>
  );
}
