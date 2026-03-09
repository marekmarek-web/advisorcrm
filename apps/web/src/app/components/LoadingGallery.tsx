"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const CSS = `
:root{
  --lg-bg: #0e0f13;
  --lg-surface: #121622;
  --lg-panel: #151a28;
  --lg-text: #e7e7ea;
  --lg-muted: #8a8f9b;
  --lg-border: #232a3c;
  --lg-accent: #7bd88f;
  --lg-size: 32px;
  --lg-speed: 1;
  --lg-radius: 12px;
  --lg-shadow: 0 10px 30px rgba(0,0,0,.35);
}

.lg-wrap{ max-width: 1000px; margin: 24px auto 56px; padding: 20px; color: var(--lg-text); }
.lg-header{
  display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center;
  background: linear-gradient(180deg, #151a24, #111521);
  border: 1px solid var(--lg-border); border-radius: 16px; padding: 14px 16px;
  box-shadow: var(--lg-shadow);
}
.lg-header h1{ margin: 0; font-size: 16px; letter-spacing: .3px; }
.lg-controls{ display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.lg-controls label{
  display: inline-flex; align-items: center; gap: 8px; color: var(--lg-muted); font-weight: 600;
  background: #0f1320; border: 1px solid var(--lg-border); padding: 6px 10px; border-radius: 10px;
}
.lg-controls input[type="range"]{ width: 140px; }
.lg-controls input[type="color"]{ border: none; background: transparent; width: 28px; height: 28px; padding: 0; cursor: pointer; }
.lg-controls button{
  background: #0f1320; color: #dfe3ec; border: 1px solid var(--lg-border);
  padding: 8px 12px; border-radius: 10px; cursor: pointer;
}

.lg-gallery{
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-top: 18px;
}
.lg-card{
  background: var(--lg-surface); border: 1px solid var(--lg-border); border-radius: 14px; padding: 16px;
  display: grid; place-items: center; gap: 10px; min-height: 140px;
}
.lg-card label{ color: var(--lg-muted); font-weight: 600; }

.lg-light{ --lg-bg: #f7f8fb; --lg-surface: #ffffff; --lg-panel: #f3f6ff; --lg-text: #0a0e18; --lg-muted: #4d5565; --lg-border: #dce2ee; }

[data-lg-paused="true"] .lg-loader,
[data-lg-paused="true"] .lg-loader *{ animation-play-state: paused !important; }

.lg-loader{ display: inline-grid; place-items: center; will-change: transform, opacity; }

/* 1) Spinner */
.lg-spinner{
  width: var(--lg-size); height: var(--lg-size);
  border: calc(var(--lg-size) / 8) solid transparent;
  border-top-color: var(--lg-accent);
  border-radius: 50%;
  animation: lg-spin calc(0.9s / var(--lg-speed)) linear infinite;
}

/* 2) Dual Ring */
.lg-dual-ring{ position: relative; width: var(--lg-size); height: var(--lg-size); }
.lg-dual-ring::before, .lg-dual-ring::after{
  content:""; position: absolute; inset: 0; border: calc(var(--lg-size)/10) solid transparent; border-radius: 50%;
}
.lg-dual-ring::before{
  border-top-color: var(--lg-accent); border-left-color: var(--lg-accent);
  animation: lg-spin calc(1.1s * var(--lg-speed)) linear infinite;
}
.lg-dual-ring::after{
  border-bottom-color: rgba(255,255,255,.12); border-right-color: rgba(255,255,255,.12);
  animation: lg-spin-rev calc(1.1s * var(--lg-speed)) linear infinite;
}

/* 3) Dots Pulse */
.lg-dots-pulse{ display: inline-flex; gap: calc(var(--lg-size)/6); }
.lg-dots-pulse span{
  width: calc(var(--lg-size)/4); height: calc(var(--lg-size)/4); border-radius: 50%;
  background: var(--lg-accent); opacity: .5; animation: lg-pulse calc(1.2s * var(--lg-speed)) ease-in-out infinite;
}
.lg-dots-pulse span:nth-child(2){ animation-delay: .15s; }
.lg-dots-pulse span:nth-child(3){ animation-delay: .30s; }

/* 4) Dots Bounce */
.lg-dots-bounce{ display: inline-flex; gap: calc(var(--lg-size)/6); align-items: flex-end; }
.lg-dots-bounce span{
  width: calc(var(--lg-size)/4); height: calc(var(--lg-size)/4); border-radius: 50%;
  background: var(--lg-accent); animation: lg-bounce calc(0.9s * var(--lg-speed)) ease-in-out infinite;
}
.lg-dots-bounce span:nth-child(2){ animation-delay: .1s; }
.lg-dots-bounce span:nth-child(3){ animation-delay: .2s; }

/* 5) Bar Indeterminate */
.lg-bar-indeterminate{
  width: 100%; height: calc(var(--lg-size)/3.2); background: rgba(255,255,255,.06);
  border-radius: 999px; overflow: hidden; position: relative;
}
.lg-bar-indeterminate::before{
  content:""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 0%, var(--lg-accent) 50%, transparent 100%);
  width: 40%; border-radius: inherit; animation: lg-slide-x calc(1.2s * var(--lg-speed)) ease-in-out infinite;
}

/* 6) Bar Stripes */
.lg-bar-stripes{
  width: 100%; height: calc(var(--lg-size)/3.2);
  background: repeating-linear-gradient(45deg, rgba(255,255,255,.08) 0 10px, rgba(255,255,255,.02) 10px 20px);
  border: 1px solid rgba(255,255,255,.08); border-radius: 999px; position: relative; overflow: hidden;
}
.lg-bar-stripes::after{
  content:""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(123,216,143,.25), transparent);
  animation: lg-stripes calc(1.1s * var(--lg-speed)) linear infinite;
}

/* 7) Ripple */
.lg-ripple{ position: relative; width: var(--lg-size); height: var(--lg-size); }
.lg-ripple::before, .lg-ripple::after{
  content:""; position: absolute; inset: 0; border-radius: 50%; border: 3px solid var(--lg-accent); opacity: .7;
  animation: lg-ripple calc(1.8s * var(--lg-speed)) ease-out infinite;
}
.lg-ripple::after{ animation-delay: .45s; opacity: .4; }

/* 8) Pulse */
.lg-pulse{
  width: var(--lg-size); height: var(--lg-size); border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #9cf5b0, var(--lg-accent));
  filter: saturate(1.2); animation: lg-pulse2 calc(1.2s * var(--lg-speed)) ease-in-out infinite;
}

/* 9) Ring Dash */
.lg-ring-dash svg{ width: calc(var(--lg-size) * 1.6); height: calc(var(--lg-size) * 1.6); display: block; overflow: visible; }
.lg-ring-dash circle{
  fill: none; stroke: var(--lg-accent); stroke-width: 6; stroke-linecap: round;
  stroke-dasharray: 60 100; stroke-dashoffset: 0;
  transform-box: fill-box; transform-origin: 50% 50%;
  animation: lg-ring-rot calc(1.4s / var(--lg-speed)) linear infinite, lg-ring-dash calc(1.2s / var(--lg-speed)) ease-in-out infinite;
}
@keyframes lg-ring-rot{ to { transform: rotate(360deg); } }
@keyframes lg-ring-dash{
  0%   { stroke-dasharray: 1 100;  stroke-dashoffset:   0; }
  50%  { stroke-dasharray: 60 100; stroke-dashoffset: -25; }
  100% { stroke-dasharray: 1 100;  stroke-dashoffset: -100; }
}

/* 10) Infinity */
.lg-infinity svg{ width: calc(var(--lg-size) * 2.4); height: calc(var(--lg-size) * 1.2); display: block; overflow: visible; }
.lg-infinity .lg-loop{
  fill: none; stroke: var(--lg-accent); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round;
  vector-effect: non-scaling-stroke; animation: none !important;
}

/* 11) Hourglass */
.lg-hourglass{
  width: var(--lg-size); height: var(--lg-size); position: relative; border-radius: 8px;
  background: conic-gradient(from 0deg, var(--lg-accent) 0 90deg, transparent 90deg 180deg, var(--lg-accent) 180deg 270deg, transparent 270deg);
  -webkit-mask: radial-gradient(circle at 50% 50%, transparent 44%, #fff 45%);
  mask: radial-gradient(circle at 50% 50%, transparent 44%, #fff 45%);
  animation: lg-flip calc(1.1s * var(--lg-speed)) linear infinite;
}

/* 12) Radar */
.lg-radar{
  width: calc(var(--lg-size) * 1.6); height: calc(var(--lg-size) * 1.6); border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, rgba(123,216,143,.25), transparent 60%),
    radial-gradient(circle at 50% 50%, rgba(255,255,255,.06) 2px, transparent 2px),
    radial-gradient(circle at 50% 50%, rgba(255,255,255,.06) 4px, transparent 4px);
  position: relative; overflow: hidden;
}
.lg-radar::after{
  content:""; position:absolute; inset:-10% -10%;
  background: conic-gradient(from 0deg, rgba(123,216,143,0), rgba(123,216,143,.45));
  animation: lg-spin calc(2s * var(--lg-speed)) linear infinite;
}

/* 13) Equalizer */
.lg-equalizer{ display: inline-flex; gap: calc(var(--lg-size)/6); align-items: end; height: calc(var(--lg-size) * 1.2); }
.lg-equalizer span{ width: calc(var(--lg-size)/6); background: var(--lg-accent); border-radius: 4px; animation: lg-eq calc(1.2s * var(--lg-speed)) ease-in-out infinite; }
.lg-equalizer span:nth-child(2){ animation-delay: .1s }
.lg-equalizer span:nth-child(3){ animation-delay: .2s }
.lg-equalizer span:nth-child(4){ animation-delay: .3s }
.lg-equalizer span:nth-child(5){ animation-delay: .4s }

/* 14) Typing */
.lg-typing{ display: inline-flex; gap: 6px; }
.lg-typing span{ width: 6px; height: 6px; border-radius: 50%; background: var(--lg-accent); opacity: .3; animation: lg-typing calc(1.1s * var(--lg-speed)) ease-in-out infinite; }
.lg-typing span:nth-child(2){ animation-delay: .15s }
.lg-typing span:nth-child(3){ animation-delay: .3s }

/* 15) Tiles */
.lg-tiles{
  width: calc(var(--lg-size) * 1.4); height: calc(var(--lg-size) * 1.4);
  display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 1fr; gap: 6px;
}
.lg-tiles span{
  width: 100%; height: 100%; background: var(--lg-accent); opacity: .3; border-radius: 6px;
  will-change: transform, opacity; animation: lg-tile calc(1.2s / var(--lg-speed)) ease-in-out infinite;
}
.lg-tiles span:nth-child(odd){ animation-delay: .15s; }
.lg-tiles span:nth-child(3n+2){ animation-delay: .30s; }

/* 16) Coil */
.lg-coil{ position: relative; width: calc(var(--lg-size) * 1.4); height: calc(var(--lg-size) * 1.4); }
.lg-coil span{
  position: absolute; inset: 0; border-radius: 50%;
  border: 3px solid rgba(255,255,255,.08); border-top-color: var(--lg-accent);
  transform: rotate(0deg) scale(1); animation: lg-coil calc(1.8s * var(--lg-speed)) ease-in-out infinite;
}
.lg-coil span:nth-child(2){ inset: 8%; animation-delay: .15s; }
.lg-coil span:nth-child(3){ inset: 16%; animation-delay: .3s; }
.lg-coil span:nth-child(4){ inset: 24%; animation-delay: .45s; }

/* 17) Comet */
.lg-comet{
  width: calc(var(--lg-size) * 1.6); height: calc(var(--lg-size) * 1.6); position: relative;
  background: radial-gradient(circle at 50% 50%, rgba(255,255,255,.05), transparent 60%);
  border-radius: 50%; overflow: hidden;
}
.lg-comet::after{
  content: ""; position: absolute; left: 50%; top: 50%;
  width: 8px; height: 8px; border-radius: 50%; background: var(--lg-accent);
  box-shadow: -16px 0 0 0 rgba(123,216,143,.35), -32px 0 0 0 rgba(123,216,143,.2), -48px 0 0 0 rgba(123,216,143,.08);
  transform: translate(-50%,-50%) rotate(0deg) translateX(30px);
  transform-origin: 50% 50%;
  animation: lg-comet calc(1.4s * var(--lg-speed)) linear infinite;
}

/* 18) Arc */
.lg-arc{
  width: var(--lg-size); height: var(--lg-size); border-radius: 50%;
  background: conic-gradient(from 0deg, var(--lg-accent) 0 90deg, transparent 90deg 360deg);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #fff 0);
  mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #fff 0);
  animation: lg-spin calc(0.9s * var(--lg-speed)) linear infinite;
}

/* 19) Skeleton Line */
.lg-skeleton-line{ width: 100%; height: 12px; border-radius: 999px; overflow: hidden; position: relative; background: #1a2130; border: 1px solid var(--lg-border); }
.lg-skeleton-line::after{
  content:""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent);
  transform: translateX(-100%); animation: lg-shimmer calc(1.2s * var(--lg-speed)) linear infinite;
}

/* 20) Skeleton Card */
.lg-skeleton-card{ width: 100%; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto auto; gap: 10px 12px; }
.lg-ph{ background: #1a2130; position: relative; overflow: hidden; border-radius: 8px; min-height: 12px; }
.lg-avatar{ width: 44px; height: 44px; grid-row: 1 / span 2; border-radius: 50%; }
.lg-line{ height: 12px; }
.lg-w60{ width: 60%; }
.lg-w80{ width: 80%; }
.lg-ph::after{
  content:""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent);
  transform: translateX(-100%); animation: lg-shimmer calc(1.4s * var(--lg-speed)) linear infinite;
}

/* 21) Wave */
.lg-wave{ display: inline-flex; gap: 6px; align-items: end; height: calc(var(--lg-size) * 1.2); }
.lg-wave span{ width: 6px; background: var(--lg-accent); border-radius: 999px; animation: lg-wave calc(1.2s * var(--lg-speed)) ease-in-out infinite; }
.lg-wave span:nth-child(2){ animation-delay: .1s }
.lg-wave span:nth-child(3){ animation-delay: .2s }
.lg-wave span:nth-child(4){ animation-delay: .3s }
.lg-wave span:nth-child(5){ animation-delay: .4s }

/* 22) Flip 3D */
.lg-flip3d{ width: var(--lg-size); height: var(--lg-size); background: var(--lg-accent); transform-style: preserve-3d; animation: lg-flip3d calc(1.3s * var(--lg-speed)) ease-in-out infinite; }

/* 23) Triangle */
.lg-tri{
  width: 0; height: 0;
  border-left: calc(var(--lg-size)/1.2) solid transparent;
  border-right: calc(var(--lg-size)/1.2) solid transparent;
  border-bottom: calc(var(--lg-size)*1.2) solid var(--lg-accent);
  filter: drop-shadow(0 6px 16px rgba(0,0,0,.3));
  animation: lg-spin calc(1.2s * var(--lg-speed)) linear infinite;
}

/* 24) Orbit */
.lg-orbit{
  --lg-orbit-r: calc(var(--lg-size) * 0.9);
  --lg-dot: clamp(6px, calc(var(--lg-size) / 4.5), 12px);
  position: relative;
  width: calc(var(--lg-size) * 1.8); height: calc(var(--lg-size) * 1.8);
  border-radius: 50%; overflow: visible;
}
.lg-orbit span{
  position: absolute; top: 50%; left: 50%;
  width: var(--lg-dot); height: var(--lg-dot);
  border-radius: 50%; background: var(--lg-accent);
  transform-origin: 0 0;
  transform: rotate(0deg) translateX(var(--lg-orbit-r));
  will-change: transform;
  animation: lg-orbit-spin calc(1.4s / var(--lg-speed)) linear infinite;
}
.lg-orbit .lg-p1{ animation-delay: 0s; }
.lg-orbit .lg-p2{ animation-delay: calc(-1.4s / var(--lg-speed) / 3); opacity: .75; }
.lg-orbit .lg-p3{ animation-delay: calc(-1.4s / var(--lg-speed) * 2 / 3); opacity: .55; }
@keyframes lg-orbit-spin{ to { transform: rotate(360deg) translateX(var(--lg-orbit-r)); } }

/* Keyframes */
@keyframes lg-spin{ to{ transform: rotate(360deg); } }
@keyframes lg-spin-rev{ to{ transform: rotate(-360deg); } }
@keyframes lg-pulse{ 50%{ transform: scale(1.3); opacity: 1; } }
@keyframes lg-bounce{ 50%{ transform: translateY(-40%); } }
@keyframes lg-slide-x{ 0%{ transform: translateX(-60%); } 50%{ transform: translateX(40%); } 100%{ transform: translateX(140%); } }
@keyframes lg-stripes{ to{ transform: translateX(60%); } }
@keyframes lg-ripple{ 0%{ transform: scale(.2); opacity: .85; } 100%{ transform: scale(1); opacity: 0; } }
@keyframes lg-pulse2{ 0%,100%{ transform: scale(1); filter: brightness(1); } 50%{ transform: scale(1.15); filter: brightness(1.12); } }
@keyframes lg-flip{ to{ transform: rotate(180deg); } }
@keyframes lg-eq{ 0%,100%{ height: 20%; } 50%{ height: 100%; } }
@keyframes lg-typing{ 0%,80%,100%{ opacity: .2; transform: translateY(0); } 40%{ opacity: 1; transform: translateY(-20%); } }
@keyframes lg-tile{ 0%,100%{ transform: scale(.6); opacity: .4; } 50%{ transform: scale(1); opacity: 1; } }
@keyframes lg-coil{ 0%,100%{ transform: rotate(0deg) scale(.9); } 50%{ transform: rotate(180deg) scale(1); } }
@keyframes lg-comet{ to{ transform: translate(-50%,-50%) rotate(360deg) translateX(30px); } }
@keyframes lg-shimmer{ to{ transform: translateX(100%); } }
@keyframes lg-wave{ 0%,100%{ height: 20%; } 50%{ height: 90%; } }
@keyframes lg-flip3d{ 0%{ transform: rotateX(0) rotateY(0); } 50%{ transform: rotateX(180deg) rotateY(0); } 100%{ transform: rotateX(180deg) rotateY(180deg); } }
`;

const LOADERS: { name: string; key: string }[] = [
  { name: "Spinner", key: "spinner" },
  { name: "Dual Ring", key: "dual-ring" },
  { name: "Dots Pulse", key: "dots-pulse" },
  { name: "Dots Bounce", key: "dots-bounce" },
  { name: "Bar Indeterminate", key: "bar-indeterminate" },
  { name: "Bar Stripes", key: "bar-stripes" },
  { name: "Ripple", key: "ripple" },
  { name: "Pulse", key: "pulse" },
  { name: "Ring Dash", key: "ring-dash" },
  { name: "Infinity", key: "infinity" },
  { name: "Hourglass", key: "hourglass" },
  { name: "Radar Sweep", key: "radar" },
  { name: "Equalizer", key: "equalizer" },
  { name: "Typing", key: "typing" },
  { name: "Tiles 3×3", key: "tiles" },
  { name: "Coil", key: "coil" },
  { name: "Comet", key: "comet" },
  { name: "Arc Spinner", key: "arc" },
  { name: "Skeleton Line", key: "skeleton-line" },
  { name: "Skeleton Card", key: "skeleton-card" },
  { name: "Wave", key: "wave" },
  { name: "Flip 3D", key: "flip3d" },
  { name: "Triangle Spin", key: "tri" },
  { name: "Orbit", key: "orbit" },
];

function LoaderContent({ loaderKey, infinityRef }: { loaderKey: string; infinityRef: React.RefObject<SVGPathElement | null> }) {
  switch (loaderKey) {
    case "spinner":
      return <div className="lg-loader lg-spinner" />;
    case "dual-ring":
      return <div className="lg-loader lg-dual-ring" />;
    case "dots-pulse":
      return (
        <div className="lg-loader lg-dots-pulse">
          <span />
          <span />
          <span />
        </div>
      );
    case "dots-bounce":
      return (
        <div className="lg-loader lg-dots-bounce">
          <span />
          <span />
          <span />
        </div>
      );
    case "bar-indeterminate":
      return <div className="lg-loader lg-bar-indeterminate" />;
    case "bar-stripes":
      return <div className="lg-loader lg-bar-stripes" />;
    case "ripple":
      return <div className="lg-loader lg-ripple" />;
    case "pulse":
      return <div className="lg-loader lg-pulse" />;
    case "ring-dash":
      return (
        <div className="lg-loader lg-ring-dash">
          <svg viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="16" />
          </svg>
        </div>
      );
    case "infinity":
      return (
        <div className="lg-loader lg-infinity">
          <svg viewBox="0 0 120 60">
            <path
              ref={infinityRef as React.RefObject<SVGPathElement>}
              className="lg-loop"
              d="M10,30 C10,15 30,15 45,30 C60,45 80,45 95,30 C110,15 110,45 95,30 C80,15 60,15 45,30 C30,45 10,45 10,30 Z"
            />
          </svg>
        </div>
      );
    case "hourglass":
      return <div className="lg-loader lg-hourglass" />;
    case "radar":
      return <div className="lg-loader lg-radar" />;
    case "equalizer":
      return (
        <div className="lg-loader lg-equalizer">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      );
    case "typing":
      return (
        <div className="lg-loader lg-typing">
          <span />
          <span />
          <span />
        </div>
      );
    case "tiles":
      return (
        <div className="lg-loader lg-tiles">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      );
    case "coil":
      return (
        <div className="lg-loader lg-coil">
          <span />
          <span />
          <span />
          <span />
        </div>
      );
    case "comet":
      return <div className="lg-loader lg-comet" />;
    case "arc":
      return <div className="lg-loader lg-arc" />;
    case "skeleton-line":
      return <div className="lg-loader lg-skeleton-line" />;
    case "skeleton-card":
      return (
        <div className="lg-loader lg-skeleton-card">
          <div className="lg-ph lg-avatar" />
          <div className="lg-ph lg-line lg-w60" />
          <div className="lg-ph lg-line" />
          <div className="lg-ph lg-line lg-w80" />
        </div>
      );
    case "wave":
      return (
        <div className="lg-loader lg-wave">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      );
    case "flip3d":
      return <div className="lg-loader lg-flip3d" />;
    case "tri":
      return <div className="lg-loader lg-tri" />;
    case "orbit":
      return (
        <div className="lg-loader lg-orbit">
          <span className="lg-p1" />
          <span className="lg-p2" />
          <span className="lg-p3" />
        </div>
      );
    default:
      return null;
  }
}

export function LoadingGallery() {
  const [size, setSize] = useState(32);
  const [speed, setSpeed] = useState(1);
  const [accent, setAccent] = useState("#7bd88f");
  const [paused, setPaused] = useState(false);
  const [light, setLight] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const infinityRef = useRef<SVGPathElement>(null);
  const rafRef = useRef<number>(0);

  const togglePause = useCallback(() => setPaused((p) => !p), []);
  const toggleTheme = useCallback(() => setLight((l) => !l), []);

  useEffect(() => {
    const path = infinityRef.current;
    if (!path) return;

    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;

    let start: number | null = null;
    const duration = 2200;

    function animate(ts: number) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = (elapsed % duration) / duration;
      const offset = len - progress * len;
      path!.style.strokeDashoffset = `${offset}`;
      rafRef.current = requestAnimationFrame(animate);
    }

    if (!paused) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(rafRef.current);
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [paused]);

  return (
    <div
      className={`lg-wrap${light ? " lg-light" : ""}`}
      ref={wrapRef}
      data-lg-paused={paused}
      style={
        {
          "--lg-size": `${size}px`,
          "--lg-speed": speed,
          "--lg-accent": accent,
        } as React.CSSProperties
      }
    >
      <style>{CSS}</style>

      <header className="lg-header">
        <h1>Loading Animations – Gallery</h1>
        <div className="lg-controls">
          <label>
            Size
            <input
              type="range"
              min={12}
              max={96}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </label>
          <label>
            Speed
            <input
              type="range"
              min={0.4}
              max={2.5}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </label>
          <label>
            Color
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
            />
          </label>
          <button onClick={togglePause}>{paused ? "Resume" : "Pause"}</button>
          <button onClick={toggleTheme}>{light ? "Light" : "Dark"}</button>
        </div>
      </header>

      <main className="lg-gallery">
        {LOADERS.map((loader) => (
          <div className="lg-card" key={loader.key}>
            <LoaderContent loaderKey={loader.key} infinityRef={infinityRef} />
            <label>{loader.name}</label>
          </div>
        ))}
      </main>
    </div>
  );
}
