"use client";

import { useEffect, useState } from "react";

export function Countdown({ end, children, className }) {
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    function update() {
      const seconds = Math.max(
        0,
        Math.ceil((Date.parse(end) - Date.now()) / 1000),
      );
      setRemaining(Number.isFinite(seconds) ? seconds : null);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [end]);
  if (remaining === null || remaining > 259200)
    return <span className={className}>{children}</span>;
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  return (
    <span className={className} suppressHydrationWarning>
      {d > 0 ? `${d}d, ` : ""}
      {[h, m, s].map((n) => String(n).padStart(2, "0")).join(":")}
    </span>
  );
}
