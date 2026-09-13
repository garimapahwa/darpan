import { useEffect, useState } from "react";

interface InjectionToastProps {
  instruction: string;
  countdownMs: number;
  onCancel: () => void;
}

export function InjectionToast({ instruction, countdownMs, onCancel }: InjectionToastProps) {
  const [shrink, setShrink] = useState(false);

  useEffect(() => {
    setShrink(false);
    const raf = requestAnimationFrame(() => setShrink(true));
    return () => cancelAnimationFrame(raf);
  }, [instruction]);

  return (
    <div className="injection-toast">
      <div className="injection-toast__text">
        Sending to your agent: <strong>&ldquo;{instruction}&rdquo;</strong>
      </div>
      <button className="injection-toast__cancel" onClick={onCancel}>
        Cancel
      </button>
      <div className="injection-toast__track">
        <div
          className="injection-toast__bar"
          style={{
            transitionDuration: `${countdownMs}ms`,
            width: shrink ? "0%" : "100%",
          }}
        />
      </div>
    </div>
  );
}
