"use client";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { apiError, websiteApi } from "../../lib/site/api";
export function BankId({ locale, onComplete }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const words = {
    en: [
      "Verify with BankID",
      "Open BankID",
      "Scan with the BankID app",
      "Cancel",
    ],
    sv: [
      "Verifiera med BankID",
      "Öppna BankID",
      "Skanna med BankID-appen",
      "Avbryt",
    ],
    de: [
      "Mit BankID verifizieren",
      "BankID öffnen",
      "Mit der BankID-App scannen",
      "Abbrechen",
    ],
  }[locale];
  useEffect(() => {
    if (!order?.id || order.status !== "pending") return;
    let cancelled = false;
    let timeout;
    const poll = async () => {
      try {
        const result = await websiteApi("bankid_poll", { id: order.id });
        if (cancelled) return;
        if (result.status === "complete") {
          setOrder(null);
          onComplete();
          return;
        }
        setOrder((old) => ({ ...old, ...result }));
        if (result.status === "pending") timeout = setTimeout(poll, 2000);
      } catch (e) {
        if (!cancelled) setError(apiError(e, locale));
      }
    };
    timeout = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [order?.id, order?.status, locale]);
  return (
    <div>
      <button
        className="site-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setOrder(await websiteApi("bankid_start"));
          } catch (e) {
            setError(apiError(e, locale));
          } finally {
            setBusy(false);
          }
        }}
      >
        {words[0]}
      </button>
      {order?.status === "pending" && (
        <div>
          <p>{words[2]}</p>
          <QRCodeSVG value={order.qr_text} size={220} />
          <p>
            <a
              href={`bankid:///?autostarttoken=${encodeURIComponent(order.autoStartToken)}&redirect=null`}
            >
              {words[1]}
            </a>
          </p>
          <button
            onClick={async () => {
              try {
                await websiteApi("bankid_cancel", { id: order.id });
              } catch (e) {
                setError(apiError(e, locale));
              } finally {
                setOrder(null);
              }
            }}
          >
            {words[3]}
          </button>
        </div>
      )}
      {order?.status === "failed" && (
        <p role="alert">
          {apiError(new Error("identity_provider_unavailable"), locale)}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
