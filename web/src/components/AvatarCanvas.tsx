import { useEffect, useRef, useState } from "react";

interface AvatarCanvasProps {
  getAmplitude: () => number;
  speaking: boolean;
  emotion: "neutral" | "happy" | "sad" | "confused";
}

export function AvatarCanvas({ getAmplitude, speaking, emotion }: AvatarCanvasProps) {
  const [mouthOpen, setMouthOpen] = useState(0);
  const [blink, setBlink] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const amp = speaking ? getAmplitude() : 0;
      setMouthOpen((prev) => prev + (Math.min(1, amp * 3.2) - prev) * 0.35);
    }
    loop();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [speaking, getAmplitude]);

  useEffect(() => {
    let cancelled = false;
    function scheduleBlink() {
      const delay = 2200 + Math.random() * 2600;
      window.setTimeout(() => {
        if (cancelled) return;
        setBlink(true);
        window.setTimeout(() => {
          if (!cancelled) setBlink(false);
        }, 140);
        scheduleBlink();
      }, delay);
    }
    scheduleBlink();
    return () => {
      cancelled = true;
    };
  }, []);

  const mouthHeight = 6 + mouthOpen * 34;
  const browOffset = emotion === "confused" ? -3 : emotion === "sad" ? 4 : 0;
  const mouthCurve = emotion === "happy" ? 14 : emotion === "sad" ? -10 : 2;
  const eyeScale = blink ? 0.08 : 1;

  return (
    <svg viewBox="0 0 300 300" className={`avatar avatar--${emotion}`} role="img" aria-label="AI avatar">
      <circle cx="150" cy="150" r="130" className="avatar__face" />

      <g transform={`translate(0, ${browOffset})`}>
        <rect x="85" y="112" width="46" height="8" rx="4" className="avatar__brow" />
        <rect x="169" y="112" width="46" height="8" rx="4" className="avatar__brow" />
      </g>

      <g>
        <ellipse cx="108" cy="150" rx="12" ry={12 * eyeScale} className="avatar__eye" />
        <ellipse cx="192" cy="150" rx="12" ry={12 * eyeScale} className="avatar__eye" />
      </g>

      <path
        d={`M 110 ${210 - mouthCurve} Q 150 ${210 + mouthCurve + mouthHeight} 190 ${210 - mouthCurve}`}
        className="avatar__mouth"
        strokeWidth={10}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
