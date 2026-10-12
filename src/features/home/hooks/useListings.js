import { useEffect, useState } from "react";
import { getSupabase } from "../../../lib/supabaseClient";
import { fetchListings } from "../data/liveListings";

export function useListings() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const nextListings = await fetchListings(getSupabase(), {
          signal: controller.signal,
          imageBaseUrl: process.env.NEXT_PUBLIC_LISTING_IMAGE_BASE_URL,
        });
        if (!controller.signal.aborted) setListings(nextListings);
      } catch (cause) {
        if (!controller.signal.aborted) {
          console.error("Unable to load listings:", cause.message);
          setError("We couldn’t load the vehicles. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [attempt]);

  return { listings, loading, error, retry: () => setAttempt((value) => value + 1) };
}
