"use client";

import { useEffect, useState } from "react";

export function Countdown({ end, children, className, locale = "en" }) {
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
  if (remaining === null) return <span className={className}>{children}</span>;
  if (remaining > 86400) {
    const days = Math.ceil(remaining / 86400);
    return (
      <span className={className}>
        {days} {{ en: "days", sv: "dagar", de: "Tage" }[locale]}
      </span>
    );
  }
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
