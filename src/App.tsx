import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { Uni } from "./types";

// ---------- Types ----------
export type Guess = {
  uni: Uni;
  miles: number;
  direction: string; // N / NE / ...
  hint?: { key: string; value: string } | null;
};

// ---------- Utils ----------
const EARTH_R_MI = 3958.7613;
const toRad = (x: number) => (x * Math.PI) / 180;
const toDeg = (x: number) => (x * 180) / Math.PI;

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_MI * Math.asin(Math.sqrt(s));
}

function bearing16(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return dirs[Math.round(brng / 22.5) % 16];
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function colorForMiles(mi: number) {
  // Define gradient stops (in miles)
  const minDist = 0;      // closest (red)
  const maxDist = 2000;   // farthest (gray)

  // Clamp distance between min and max
  const clamped = Math.max(minDist, Math.min(mi, maxDist));

  // Compute t = 0 (near) → 1 (far)
  const t = (clamped - minDist) / (maxDist - minDist);

  // Interpolate hue: red (0°) → yellow (60°) → gray (~220°)
  // You can tweak the hue range for better color spread
  const hue = 0 + (220 - 0) * t; // 0=red, 220=gray-blue
  const saturation = 100 - 50 * t; // fade out slightly
  const lightness = 50 + 10 * t; // slightly brighter for distance

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function radiusForMiles(mi: number) {
  // slightly bigger as you get closer (cap 6–10px)
  if (mi > 1500) return 6;
  if (mi > 700)  return 7;
  if (mi > 250)  return 8;
  return 10;
}

function pickHint(stats: Record<string, string>, used: string[]) {
  const ALLOW = [
    "Established",
    "Motto",
    "Nickname",
    "Colors",
    "Undergraduates",
    "Endowment",
    "Sporting affiliations",
    "Campus",
    "Newspaper",
    "Mascot",
    "President",
    "Location",
  ];
  const pool = ALLOW.filter((k) => stats[k] && !used.includes(k));
  if (!pool.length) return null;
  const key = pool[Math.floor(Math.random() * pool.length)];
  return { key, value: stats[key] };
}

// function dailySeedIndex(len: number) {
//   // Deterministic by local date (YYYYMMDD)
//   const now = new Date();
//   const y = now.getFullYear();
//   const m = now.getMonth() + 1;
//   const d = now.getDate();
//   const seed = Number(`${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`);
//   return len ? seed % len : 0;
// }

export function useUniversities() {
  const [universities, setUniversities] = useState<Uni[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/universities_clean.min.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((raw: any[]) => {
        if (!Array.isArray(raw)) throw new Error("JSON root must be an array");

        const cleaned: Uni[] = raw
          .map((row: any) => {
            // map name/city/state from your CSV→JSON columns
            const name =
              row.name ??
              row["school.name_x"] ??
              row["Query Name"] ??
              row["Wikipedia Title"] ??
              "";

            const city =
              row.city ??
              row["school.city"] ??
              row["Query City"] ??
              undefined;

            const state =
              row.state ??
              row["school.state"] ??
              row["Query State"] ??
              undefined;

            // lat/lng should already be present from your Python script
            const lat = typeof row.lat === "string" ? Number(row.lat) : row.lat;
            const lng = typeof row.lng === "string" ? Number(row.lng) : row.lng;

            // pick a stable id if available
            const id = row.id ?? row.unitid ?? row.ope8_id ?? row.ope6_id ?? name;

            // optional: small stats object for hints if present
            const statKeys = [
              "Established",
              "Motto",
              "Nickname",
              "Colors",
              "Undergraduates",
              "Endowment",
              "Sporting affiliations",
              "Campus",
              "Newspaper",
              "Mascot",
              "President",
              "Location",
            ];
            const stats: Record<string, string> = {};
            for (const k of statKeys) {
              const v = row[k];
              if (typeof v === "string" && v.trim()) stats[k] = v.trim();
            }

            return {
              id,
              name: String(name),
              city,
              state,
              lat,
              lng,
              stats: Object.keys(stats).length ? stats : undefined,
              raw: row,
            } as Uni;
          })
          .filter(
            (u) =>
              u.name &&
              Number.isFinite(u.lat) &&
              Number.isFinite(u.lng)
          );

        console.log("Universities loaded:", raw.length, "→ cleaned:", cleaned.length);
        setUniversities(cleaned.length ? cleaned : FALLBACK);
      })
      .catch((err) => {
        console.error("Failed to load universities:", err);
        setError(err.message);
        setUniversities(FALLBACK); // fallback to two demo schools
      })
      .finally(() => setLoading(false));
  }, []);

  return { universities, loading, error };
}

// ---------- Demo data (used if fetch fails) ----------
const FALLBACK: Uni[] = [
  {
    id: 1,
    name: "Stanford University",
    city: "Stanford",
    state: "CA",
    lat: 37.4275,
    lng: -122.1697,
    aliases: ["Leland Stanford Junior University"],
    stats: {
      Established: "1891",
      Motto: "The wind of freedom blows",
      Nickname: "Cardinal",
      Colors: "Cardinal Red, White",
      "Sporting affiliations": "ACC (NCAA D-I)",
      Undergraduates: "7841 (fall 2023)",
      Location: "Stanford, California",
      Mascot: "Stanford Tree (unofficial)",
    },
  },
  {
    id: 2,
    name: "University of Chicago",
    city: "Chicago",
    state: "IL",
    lat: 41.7897,
    lng: -87.5997,
    stats: {
      Established: "1890",
      Motto: "Crescat scientia; vita excolatur",
      Nickname: "Maroons",
      Colors: "Maroon, White",
      Undergraduates: "7339",
      Location: "Chicago, Illinois",
      Mascot: "Phil the Phoenix",
    },
  },
];

// ---------- Map helpers ----------

function USMap({ guesses, answer, reveal }: { guesses: Guess[]; answer?: Uni; reveal: boolean }) {
  const pts: Array<[number, number]> = guesses.map((g) => [g.uni.lat, g.uni.lng]);
  if (reveal && answer) pts.push([answer.lat, answer.lng]);

  return (
    <div className="w-full h-[70vh] rounded-2xl overflow-hidden shadow">
      <MapContainer center={[39, -98]} zoom={4} className="w-full h-full">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        {guesses.map((g, i) => {
          const color = colorForMiles(g.miles);
          const r = radiusForMiles(g.miles);
          return (
            <CircleMarker
              key={i}
              center={[g.uni.lat, g.uni.lng]}
              radius={r}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 2 }}
            >
              <Tooltip>
                <div className="text-sm">
                  <div className="font-medium">{g.uni.name}</div>
                  <div>{Math.round(g.miles)} miles {g.direction}</div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
        {reveal && answer && (
          <CircleMarker
            center={[answer.lat, answer.lng]}
            radius={12}
            pathOptions={{ color: "#10B981", fillColor: "#10B981", fillOpacity: 0.95, weight: 3 }} // emerald-500
          >
            <Tooltip>
              <div className="text-sm font-semibold">Answer: {answer.name}</div>
            </Tooltip>
          </CircleMarker>
        )}
        {/* <FitBounds points={pts} /> */}
      </MapContainer>
    </div>
  );
}

// ---------- Guess Input (simple alphabetical filter) ----------
function GuessInput({ list, onSelect }: { list: Uni[]; onSelect: (u: Uni) => void }) {
  const [q, setQ] = useState("");
  const qn = normalize(q);

  // Build a prepared, sorted list once when `list` changes.
  const prepared = useMemo(() => {
    const arr = list
      .map((u) => {
        const label = (u?.name ?? "").toString();
        if (!label) return null;
        const norm = normalize(label);
        // stable unique-ish key: prefer id; fall back to name+city+state
        const key =
          String(u.id ?? "") +
          "|" +
          label +
          "|" +
          (u.city ?? "") +
          "|" +
          (u.state ?? "");
        return { u, label, norm, key };
      })
      .filter(Boolean) as Array<{ u: Uni; label: string; norm: string; key: string }>;

    // Sort alphabetically once
    arr.sort((a, b) => a.label.localeCompare(b.label));
    return arr;
  }, [list]);

  // Filter incrementally from the pre-sorted list
  const filtered = useMemo(() => {
    if (!qn) return prepared.slice(0, 200);
    const starts: typeof prepared = [];
    const includes: typeof prepared = [];
    for (const row of prepared) {
      if (row.norm.startsWith(qn)) starts.push(row);
      else if (row.norm.includes(qn)) includes.push(row);
      if (starts.length + includes.length >= 200) break; // cap
    }
    return starts.concat(includes).slice(0, 200);
  }, [prepared, qn]);

  return (
    <div className="relative w-full max-w-xl mx-auto z-[1000] bg-white/95 backdrop-blur-sm">
      <input
        className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Type a university…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered[0]) {
            onSelect(filtered[0].u);
            setQ("");
          }
        }}
      />

      {/* Dropdown should float on top of other content */}
      <div className="absolute left-0 right-0 mt-1 max-h-64 overflow-auto rounded-xl border bg-white shadow-lg">
        {filtered.map(({ u, label, key }) => (
          <button
            key={key}
            className="w-full text-left px-3 py-2 hover:bg-gray-100"
            onMouseDown={(e) => e.preventDefault()} // keep focus
            onClick={() => {
              onSelect(u);
              setQ("");
            }}
          >
            {label}
            {u.state ? (
              <span className="text-gray-500">{` — ${u.city ?? ""}${
                u.city ? ", " : ""
              }${u.state}`}</span>
            ) : null}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-gray-500">No matches</div>
        )}
      </div>
    </div>
  );
}

// ---------- Guess List ----------
function GuessList({ guesses }: { guesses: Guess[] }) {
  return (
    <div className="space-y-3">
      {guesses.map((g, i) => (
        <div key={i} className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="font-medium">{g.uni.name}</div>
            <div className="text-sm text-gray-600">{Math.round(g.miles)} miles • {g.direction}</div>
          </div>
          {g.hint && (
            <div className="mt-1 text-sm text-gray-700">
              <span className="font-semibold">Hint:</span> {g.hint.key} — {g.hint.value}
            </div>
          )}
        </div>
      ))}
      {guesses.length === 0 && <div className="text-gray-500">No guesses yet. Make your first guess!</div>}
    </div>
  );
}

// ---------- Main App ----------
export default function App() {
  const { universities } = useUniversities();
  const [answer, setAnswer] = useState<Uni | null>(null);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [usedHintKeys, setUsedHintKeys] = useState<string[]>([]);

  const pickedOnce = useRef(false);

  useEffect(() => {
    if (!universities.length || pickedOnce.current) return;
    // pick a random index on each reload
    const idx = Math.floor(Math.random() * universities.length);
    setAnswer(universities[idx]);
    pickedOnce.current = true; // prevent double-pick in React StrictMode
    console.log("[Universle] Chosen answer:", universities[idx].name);
  }, [universities]);

  const attemptsLeft = 6 - guesses.length;
  const gameOver =
    guesses.length >= 6 ||
    !!(answer && guesses.some((g) => normalize(g.uni.name) === normalize(answer.name)));
  const won = !!(
    answer && guesses.some((g) => normalize(g.uni.name) === normalize(answer.name))
  );

  const onSelect = (u: Uni) => {
    if (!answer || gameOver) return;
    const miles = haversineMiles(
      { lat: u.lat, lng: u.lng },
      { lat: answer.lat, lng: answer.lng }
    );
    const direction = bearing16(
      { lat: u.lat, lng: u.lng },
      { lat: answer.lat, lng: answer.lng }
    );
    const hint = answer.stats ? pickHint(answer.stats, usedHintKeys) : null;
    if (hint) setUsedHintKeys((ks) => [...ks, hint.key]);

    setGuesses((gs) => [{ uni: u, miles, direction, hint }, ...gs]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="flex w-full items-center justify-between px-4 py-3">
          <h1 className="text-2xl font-bold tracking-tight">Universle</h1>
          <div className="text-sm text-slate-600">{attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left</div>
        </div>
      </header>

      <main className="grid w-full grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[2fr_1fr]">
        {/* Left: Map + Input */}
        <div className="space-y-4">
          {/* Input */}
          <GuessInput list={universities} onSelect={onSelect} />
          {/* Map */}
          <USMap guesses={[...guesses].reverse()} answer={answer ?? undefined} reveal={gameOver} />
        </div>

        {/* Right: Guesses */}
        <aside>
          <div className="mb-3 text-lg font-semibold">Your guesses</div>
          <GuessList guesses={guesses} />
          <div className="mt-4 text-sm text-slate-600">
            {gameOver && answer && (
              <div>
                {won ? "🎉 Correct!" : "❌ Out of attempts."} The answer was <span className="font-semibold">{answer.name}</span>.
              </div>
            )}
          </div>
        </aside>
      </main>

      <footer className="border-t bg-white/60">
        <div className="w-full px-4 py-4 text-sm text-slate-600">
          Data © you. Map © OpenStreetMap contributors. Built with React, Tailwind, Leaflet.
        </div>
      </footer>
    </div>
  );
}
