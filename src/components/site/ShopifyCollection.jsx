"use client";

import { useEffect, useRef, useState } from "react";

let storefront;

function loadStorefront() {
  if (window.ShopifyBuy?.UI) return Promise.resolve(window.ShopifyBuy);
  if (!storefront)
    storefront = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js";
      script.async = true;
      script.onload = () => resolve(window.ShopifyBuy);
      script.onerror = () => {
        storefront = null;
        reject(new Error("Store unavailable"));
      };
      document.head.appendChild(script);
    });
  return storefront;
}

export function ShopifyCollection() {
  const node = useRef(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let disposed = false;
    let component;
    async function mount() {
      try {
        const shopify = await loadStorefront();
        if (disposed) return;
        const client = shopify.buildClient({
          domain: "garage53.myshopify.com",
          // Public storefront token, published in the original site's buy-button embed.
          storefrontAccessToken: "5d24befc22317def27edf433da595ae9",
        });
        const ui = await shopify.UI.onReady(client);
        if (disposed) return;
        component = await ui.createComponent("collection", {
          id: "657670930773",
          node: node.current,
          moneyFormat: "{{amount_no_decimals}} kr",
          options: {
            product: {
              styles: {
                product: {
                  "@media (min-width: 601px)": {
                    "max-width": "calc(33.33333% - 30px)",
                    "margin-left": "30px",
                    "margin-bottom": "40px",
                  },
                },
                button: {
                  "background-color": "#f1821b",
                  ":hover": { "background-color": "#d86e0a" },
                },
                title: { color: "#193825" },
              },
            },
            cart: { popup: false },
          },
        });
        if (disposed) component?.destroy?.();
      } catch {
        if (!disposed) setUnavailable(true);
      }
    }
    mount();
    return () => {
      disposed = true;
      component?.destroy?.();
    };
  }, []);
  return (
    <div ref={node}>
      {unavailable && (
        <p className="text-center">
          <a className="button" href="https://garage53.myshopify.com">
            Bidders Highway merchandise ↗
          </a>
        </p>
      )}
    </div>
  );
}
