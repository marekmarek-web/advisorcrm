"use client";

interface LinesAndDotsLoaderProps {
  className?: string;
}

const SECTOR_COUNT = 60;
const RADIUS_EM = 4.25;

export function LinesAndDotsLoader({ className = "" }: LinesAndDotsLoaderProps) {
  const sectors = Array.from({ length: SECTOR_COUNT }, (_, i) => i);

  return (
    <>
      <style>{`
        .lines-and-dots {
          --anim-dur: 2s;
          --dot-size: 0.4em;
          --line-length: 3em;
          --line-width: 0.1em;
          position: relative;
          width: 12em;
          height: 12em;
        }
        .lines-and-dots__sector {
          top: 50%;
          left: 50%;
          position: absolute;
        }
        .lines-and-dots__dot,
        .lines-and-dots__dot::before,
        .lines-and-dots__line,
        .lines-and-dots__sector {
          position: absolute;
        }
        .lines-and-dots__dot,
        .lines-and-dots__dot::before,
        .lines-and-dots__line {
          animation-duration: var(--anim-dur);
          animation-delay: inherit;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        .lines-and-dots__dot::before,
        .lines-and-dots__line {
          background-color: currentColor;
        }
        .lines-and-dots__dot {
          animation-name: dot-move-in-out;
          top: calc(var(--line-length) / -2 + var(--dot-size) / -2);
          left: calc(var(--dot-size) / -2);
          width: var(--dot-size);
          height: var(--dot-size);
          z-index: 1;
        }
        .lines-and-dots__dot::before {
          animation-name: dot-scale-in-out;
          animation-timing-function: linear;
          border-radius: 50%;
          content: "";
          display: block;
          width: 100%;
          height: 100%;
        }
        .lines-and-dots__dot + .lines-and-dots__dot {
          animation-name: dot-move-out-in;
          top: calc(var(--line-length) / 2 + var(--dot-size) / -2);
        }
        .lines-and-dots__dot + .lines-and-dots__dot::before {
          animation-name: dot-scale-out-in;
        }
        .lines-and-dots__line {
          animation-name: line-shade, line-spin;
          opacity: 0.5;
          top: calc(var(--line-length) / -2);
          left: calc(var(--line-width) / -2);
          width: var(--line-width);
          height: var(--line-length);
        }

        @keyframes dot-move-in-out {
          from { animation-timing-function: ease-in; transform: translateY(0); }
          50% { animation-timing-function: ease-out; transform: translateY(1.5em); }
          to { transform: translateY(3em); }
        }
        @keyframes dot-move-out-in {
          from { animation-timing-function: ease-in; transform: translateY(0); }
          50% { animation-timing-function: ease-out; transform: translateY(-1.5em); }
          to { transform: translateY(-3em); }
        }
        @keyframes dot-scale-in-out {
          from, to { transform: scale(0.67); }
          50% { transform: scale(1); }
        }
        @keyframes dot-scale-out-in {
          from, to { transform: scale(0.67); }
          50% { transform: scale(0.33); }
        }
        @keyframes line-shade {
          from, to { animation-timing-function: ease-in; transform: scaleY(1); }
          50% { animation-timing-function: ease-out; transform: scaleY(0); }
        }
        @keyframes line-spin {
          from, to { animation-timing-function: ease-in; opacity: 0.5; }
          50% { animation-timing-function: step-start; opacity: 0; }
        }
      `}</style>

      <div className={`lines-and-dots ${className}`} role="status" aria-label="Loading">
        {sectors.map((i) => {
          const fraction = i / SECTOR_COUNT;
          const sectorStyle: React.CSSProperties = {
            animationDelay: `calc(var(--anim-dur) * ${-fraction})`,
            transform: `rotate(${-fraction * 360}deg) translateY(${RADIUS_EM}em)`,
          };
          return (
            <div key={i} className="lines-and-dots__sector" style={sectorStyle}>
              <div className="lines-and-dots__line" />
              <div className="lines-and-dots__dot" />
              <div className="lines-and-dots__dot" />
            </div>
          );
        })}
      </div>
    </>
  );
}
