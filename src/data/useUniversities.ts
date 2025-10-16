// src/data/useUniversities.ts
import { useEffect, useState } from "react";

export type Uni = {
  name: string;            // mapped from "school.name_x"
  city?: string;
  state?: string;
  lat: number;
  lng: number;
  raw: Record<string, unknown>;
};

export function useUniversities() {
  const [universities, setUniversities] = useState<Uni[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In dev and prod, public/ files are served from the base URL.
    const url = `${import.meta.env.BASE_URL}universities_clean.min.json`;

    (async () => {
      try {
        const r = await fetch(url, { cache: "no-cache" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw = await r.json();
        if (!Array.isArray(raw)) throw new Error("JSON root must be an array");

        const cleaned: Uni[] = raw
          .map((row: any) => {
            const lat = Number(row.lat);
            const lng = Number(row.lng);
            const name =
              row["school.name_x"] ??
              row["Query Name"] ??
              row["Wikipedia Title"] ??
              "";
            return {
              name: String(name),
              city: row["school.city"] ? String(row["school.city"]) : undefined,
              state: row["school.state"] ? String(row["school.state"]) : undefined,
              lat,
              lng,
              raw: row,
            } as Uni;
          })
          .filter(u => u.name && Number.isFinite(u.lat) && Number.isFinite(u.lng));

        console.log(`Universities loaded: ${raw.length} → cleaned: ${cleaned.length}`);
        setUniversities(cleaned);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { universities, error, loading };
}