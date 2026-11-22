// Server component that emits a `<script type="application/ld+json">` node
// for a passed JSON-LD graph (spec 13.4). `<` is escaped to keep `</script>`
// breakouts impossible.

export interface JsonLdProps {
  /** One JSON-LD graph object (or an @graph array). */
  data: Record<string, unknown> | Record<string, unknown>[];
  /** Optional element id, e.g. "jsonld-organization". */
  id?: string;
}

/** Renders one JSON-LD script tag; drop one per graph next to the content. */
export function JsonLd({ data, id }: JsonLdProps) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" {...(id ? { id } : {})} dangerouslySetInnerHTML={{ __html: json }} />;
}
