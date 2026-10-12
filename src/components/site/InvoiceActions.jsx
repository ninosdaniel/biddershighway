"use client";
import { useEffect, useRef, useState } from "react";
import { apiError, websiteApi } from "../../lib/site/api";

const words = {
  en: [
    "Pay with Swish",
    "Open Swish",
    "Scan with the Swish app",
    "Waiting for payment…",
    "Payment received",
    "Payment was not completed. You can try again.",
    "Cancel payment request",
    "Download invoice",
    "Invoice is being prepared.",
  ],
  sv: [
    "Betala med Swish",
    "Öppna Swish",
    "Skanna med Swish-appen",
    "Inväntar betalning…",
    "Betalning mottagen",
    "Betalningen slutfördes inte. Du kan försöka igen.",
    "Avbryt betalningsbegäran",
    "Hämta faktura",
    "Fakturan förbereds.",
  ],
  de: [
    "Mit Swish bezahlen",
    "Swish öffnen",
    "Mit der Swish-App scannen",
    "Zahlung wird erwartet…",
    "Zahlung eingegangen",
    "Die Zahlung wurde nicht abgeschlossen. Sie können es erneut versuchen.",
    "Zahlungsanfrage abbrechen",
    "Rechnung herunterladen",
    "Ihre Rechnung wird vorbereitet.",
  ],
};
export function InvoiceActions({ payment, locale, onPaid }) {
  const w = words[locale];
  const [order, setOrder] = useState(null),
    [qr, setQr] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef(null),
    paidCallback = useRef(onPaid);
  useEffect(() => {
    paidCallback.current = onPaid;
  }, [onPaid]);
  useEffect(() => {
    if (!order?.id || order.status !== "CREATED") return;
    let stopped = false,
      timer;
    const poll = async () => {
      try {
        const state = await websiteApi("swish_status", {
          payment_id: payment.id,
          id: order.id,
        });
        if (stopped) return;
        setOrder((previous) => ({ ...previous, ...state }));
        if (state.status === "PAID") {
          paidCallback.current?.();
          return;
        }
        if (state.status !== "CREATED") {
          request.current = null;
          return;
        }
        timer = setTimeout(poll, 3000);
      } catch (e) {
        if (!stopped) setError(apiError(e, locale));
      }
    };
    timer = setTimeout(poll, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [order?.id, order?.status, payment.id, locale]);
  const start = async () => {
    setBusy(true);
    setError("");
    setQr("");
    request.current ||= crypto.randomUUID();
    try {
      const state = await websiteApi(
        "swish_start",
        { payment_id: payment.id },
        request.current,
      );
      setOrder(state);
      if (state.status === "PAID") paidCallback.current?.();
      else if (state.token) {
        const result = await websiteApi("swish_qr", {
          payment_id: payment.id,
          id: state.id,
        });
        setQr(result.image);
      }
    } catch (e) {
      setError(apiError(e, locale));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    setError("");
    try {
      const state = await websiteApi("swish_cancel", {
        payment_id: payment.id,
        id: order.id,
      });
      setOrder(state);
      setQr("");
      if (state.status === "PAID") paidCallback.current?.();
      else if (state.status !== "CREATED") request.current = null;
    } catch (e) {
      setError(apiError(e, locale));
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const file = await websiteApi("invoice_pdf", { payment_id: payment.id });
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError(apiError(e, locale));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="site-invoice-actions">
      {error && <p role="alert">{error}</p>}
      {payment.invoice_number ? (
        <button disabled={busy} onClick={download}>
          {w[7]}
        </button>
      ) : (
        <p>{w[8]}</p>
      )}
      {!payment.paid_at && payment.invoice_number && (
        <>
          {order?.status === "CREATED" ? (
            <div className="site-swish">
              <p role="status">{w[3]}</p>
              {qr && (
                <figure>
                  <img src={qr} width="260" height="260" alt={w[2]} />
                  <figcaption>{w[2]}</figcaption>
                </figure>
              )}
              {order.token && (
                <a
                  className="site-button"
                  href={`swish://paymentrequest?token=${encodeURIComponent(order.token)}&callbackurl=${encodeURIComponent(window.location.origin + "/" + locale + "/account")}`}
                >
                  {w[1]}
                </a>
              )}
              <button disabled={busy} onClick={cancel}>
                {w[6]}
              </button>
            </div>
          ) : order?.status === "PAID" ? (
            <p role="status">{w[4]}</p>
          ) : (
            <>
              {order && <p role="status">{w[5]}</p>}
              <button className="site-button" disabled={busy} onClick={start}>
                {w[0]}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
