// Cookie jar helpers for supertest: parse Set-Cookie arrays, extract values,
// rebuild Cookie headers (needed to replay rotated/old tokens deliberately).
export interface CookieJar {
  values: Map<string, string>;
  absorb(setCookie: string[] | undefined): void;
  header(): string;
  get(name: string): string | undefined;
}

export function createCookieJar(): CookieJar {
  const values = new Map<string, string>();
  return {
    values,
    absorb(setCookie) {
      for (const raw of setCookie ?? []) {
        const [pair] = raw.split(';');
        const eq = pair?.indexOf('=') ?? -1;
        if (!pair || eq < 0) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value === '') values.delete(name);
        else values.set(name, value);
      }
    },
    header() {
      return [...values.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    get(name) {
      return values.get(name);
    },
  };
}
