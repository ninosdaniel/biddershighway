"use client";
import { useEffect, useRef } from "react";
let loading;
export function Captcha() {
  const ref = useRef(null);
  useEffect(() => {
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!sitekey) return;
    let widget;
    let cancelled = false;
    loading ||= new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    loading
      .then(() => {
        if (!cancelled && ref.current)
          widget = window.turnstile.render(ref.current, { sitekey });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widget !== undefined) window.turnstile?.remove(widget);
    };
  }, []);
  return <div ref={ref} className="site-captcha" />;
}
