-- Search infrastructure: pg_trgm + unaccent, trigger-maintained weighted
-- search_vector on Product (name A, brand + article numbers B, description C),
-- trigram GIN indexes for typo tolerance, partial + FK performance indexes.
-- Rationale: docs/database.md and docs/adr/0002-search-vector-by-trigger.md

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Immutable-safe wrapper (usable in expression contexts too).
CREATE OR REPLACE FUNCTION toolhub_unaccent(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, t);
$$;

-- Weighted tsvector for one product row. Brand name and article numbers come
-- from subselects because a generated column cannot reference other tables.
CREATE OR REPLACE FUNCTION toolhub_product_tsv(
  p_id text,
  p_name text,
  p_brand_id text,
  p_short_description text,
  p_description_html text
) RETURNS tsvector
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    setweight(to_tsvector('english', toolhub_unaccent(coalesce(p_name, ''))), 'A') ||
    setweight(to_tsvector('english', toolhub_unaccent(
      coalesce((SELECT b.name FROM "Brand" b WHERE b.id = p_brand_id), '') || ' ' ||
      coalesce((SELECT string_agg(v."articleNo", ' ') FROM "Variant" v
                WHERE v."productId" = p_id AND v."deletedAt" IS NULL), '')
    )), 'B') ||
    setweight(to_tsvector('english', toolhub_unaccent(
      coalesce(p_short_description, '') || ' ' ||
      regexp_replace(coalesce(p_description_html, ''), '<[^>]*>', ' ', 'g')
    )), 'C')
$$;

-- Keep the vector in sync when the product's own text fields change.
CREATE OR REPLACE FUNCTION product_tsv_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" := toolhub_product_tsv(
    NEW.id, NEW.name, NEW."brandId", NEW."shortDescription", NEW."descriptionHtml");
  RETURN NEW;
END $$;

CREATE TRIGGER product_search_vector_tgr
BEFORE INSERT OR UPDATE OF name, "brandId", "shortDescription", "descriptionHtml" ON "Product"
FOR EACH ROW EXECUTE FUNCTION product_tsv_trigger();

-- Article numbers belong to variants: refresh the parent product when they change.
CREATE OR REPLACE FUNCTION product_tsv_refresh(p_id text) RETURNS void
LANGUAGE sql AS $$
  UPDATE "Product" p
  SET "searchVector" = toolhub_product_tsv(p.id, p.name, p."brandId", p."shortDescription", p."descriptionHtml")
  WHERE p.id = p_id AND p."deletedAt" IS NULL;
$$;

CREATE OR REPLACE FUNCTION variant_tsv_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM product_tsv_refresh(COALESCE(NEW."productId", OLD."productId"));
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER variant_search_vector_tgr
AFTER INSERT OR UPDATE OF "articleNo", "productId", "deletedAt" OR DELETE ON "Variant"
FOR EACH ROW EXECUTE FUNCTION variant_tsv_trigger();

-- Brand renames touch every product of the brand.
CREATE OR REPLACE FUNCTION brand_tsv_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM product_tsv_refresh(p.id)
  FROM "Product" p WHERE p."brandId" = NEW.id AND p."deletedAt" IS NULL;
  RETURN NEW;
END $$;

CREATE TRIGGER brand_search_vector_tgr
AFTER UPDATE OF name ON "Brand"
FOR EACH ROW EXECUTE FUNCTION brand_tsv_trigger();

-- Full-text GIN index over the maintained vector.
CREATE INDEX products_search_tsv_idx ON "Product" USING GIN ("searchVector");

-- Trigram tolerance on article numbers and product names.
CREATE INDEX variants_articleno_trgm_idx ON "Variant" USING GIN ("articleNo" gin_trgm_ops);
CREATE INDEX products_name_trgm_idx ON "Product" USING GIN (name gin_trgm_ops);

-- Partial indexes for the hot listing paths (published, not deleted).
CREATE INDEX products_published_category_idx ON "Product" ("categoryId")
  WHERE "deletedAt" IS NULL AND status = 'PUBLISHED';
CREATE INDEX variants_active_product_idx ON "Variant" ("productId", "sortOrder")
  WHERE "deletedAt" IS NULL AND "isActive" = true;
CREATE INDEX variants_stock_idx ON "Variant" ("stockQty")
  WHERE "deletedAt" IS NULL;

-- Additional FK / predicate indexes (Section 17).
CREATE INDEX orders_status_idx ON "Order" (status, "createdAt");
CREATE INDEX orders_payment_status_idx ON "Order" ("paymentStatus");
CREATE INDEX search_query_log_q_idx ON "SearchQueryLog" (q);
