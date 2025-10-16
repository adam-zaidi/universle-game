export type Uni = {
  id: string | number;
  name: string;
  city?: string;
  state?: string;
  lat: number;
  lng: number;
  /** optional fields depending on source */
  stats?: Record<string, string>;
  aliases?: string[];
  raw?: Record<string, unknown>;
};