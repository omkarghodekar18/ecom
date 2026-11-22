'use client';

// Content management (spec 15.5): banners (placement, schedule, CTA, ordering)
// and CMS pages (block JSON editor with a live-ish preview + SEO fields).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { apiFetch } from '@/lib/api-client';
import { adminApi } from './admin-api';
import { AdminPageHeader } from './admin-shell';

interface BannerDto {
  id: string;
  placement: string;
  eyebrow: string | null;
  heading: string;
  subheading: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  image: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface CmsPageDto {
  slug: string;
  title: string;
  blocks: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  status: string;
}

const PLACEMENTS = ['HOME_HERO', 'HOME_SIDE_TOP', 'HOME_SIDE_BOTTOM', 'HOME_HIGHLIGHT', 'MENU_TEASER'];

function BannersPanel() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ['admin', 'banners'],
    queryFn: async (): Promise<BannerDto[]> =>
      (await apiFetch<BannerDto[]>('/banners', { query: { pageSize: 100 } })).data,
  });
  const [editing, setEditing] = useState<(Omit<BannerDto, 'id' | 'image' | 'sortOrder' | 'isActive'> & { id: string | null; imagePublicId: string; sortOrder: string; isActive: boolean }) | null>(null);

  const save = async () => {
    if (editing === null || editing.heading.trim() === '') return;
    try {
      const body = {
        placement: editing.placement,
        eyebrow: editing.eyebrow || null,
        heading: editing.heading.trim(),
        subheading: editing.subheading || null,
        ctaLabel: editing.ctaLabel || null,
        ctaHref: editing.ctaHref || null,
        imagePublicId: editing.imagePublicId || null,
        sortOrder: Number(editing.sortOrder) || 0,
        isActive: editing.isActive,
      };
      if (editing.id === null) await adminApi.createBanner(body);
      else await adminApi.updateBanner(editing.id, body);
      toast({ title: 'Banner saved', variant: 'success' });
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] });
    } catch (error) {
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    }
  };

  return (
    <section aria-labelledby="banners-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="banners-heading" className="text-sm font-bold uppercase tracking-wide text-muted">Banners</h2>
        <Button variant="outline" size="sm" onClick={() => setEditing({ id: null, placement: 'HOME_HERO', eyebrow: '', heading: '', subheading: '', ctaLabel: '', ctaHref: '', imagePublicId: '', sortOrder: '0', isActive: true })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New banner
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-tile border border-line text-sm">
        {(listQuery.data ?? []).map((banner) => (
          <li key={banner.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{banner.heading}</span>
              <span className="ms-2 text-xs text-muted">{banner.placement} · order {banner.sortOrder} · {banner.isActive ? 'active' : 'inactive'}</span>
            </span>
            <button type="button" className="text-xs font-bold text-brand underline underline-offset-2" onClick={() => setEditing({ ...banner, imagePublicId: banner.image?.replace(/^\/media\//, '') ?? '', sortOrder: String(banner.sortOrder) })}>
              Edit
            </button>
            <button
              type="button"
              className="text-xs font-bold text-stock-red underline underline-offset-2"
              onClick={async () => {
                try {
                  await adminApi.deleteBanner(banner.id);
                  void queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] });
                } catch (error) {
                  toast({ title: 'Could not delete', description: error instanceof Error ? error.message : undefined, variant: 'error' });
                }
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {editing ? (
        <div className="mt-3 grid gap-3 rounded-tile border border-brand/50 p-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Placement</span>
            <Select value={editing.placement} onValueChange={(value) => setEditing((prev) => prev && { ...prev, placement: value })} options={PLACEMENTS.map((value) => ({ value, label: value }))} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Heading *</span>
            <Input value={editing.heading} onChange={(event) => setEditing((prev) => prev && { ...prev, heading: event.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Eyebrow</span>
            <Input value={editing.eyebrow ?? ''} onChange={(event) => setEditing((prev) => prev && { ...prev, eyebrow: event.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Subheading</span>
            <Input value={editing.subheading ?? ''} onChange={(event) => setEditing((prev) => prev && { ...prev, subheading: event.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">CTA label</span>
            <Input value={editing.ctaLabel ?? ''} onChange={(event) => setEditing((prev) => prev && { ...prev, ctaLabel: event.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">CTA href</span>
            <Input value={editing.ctaHref ?? ''} onChange={(event) => setEditing((prev) => prev && { ...prev, ctaHref: event.target.value })} placeholder="/in/en/e/about" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Image publicId</span>
            <Input value={editing.imagePublicId} onChange={(event) => setEditing((prev) => prev && { ...prev, imagePublicId: event.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Sort order</span>
            <Input type="number" value={editing.sortOrder} onChange={(event) => setEditing((prev) => prev && { ...prev, sortOrder: event.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand-orange)]" checked={editing.isActive} onChange={(event) => setEditing((prev) => prev && { ...prev, isActive: event.target.checked })} />
            Active
          </label>
          <div className="sm:col-span-2">
            <Button variant="primary" size="sm" onClick={() => void save()}>
              <Save className="h-4 w-4" aria-hidden="true" />
              Save banner
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PagesPanel() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ['admin', 'cms-pages'],
    queryFn: async (): Promise<CmsPageDto[]> => (await apiFetch<CmsPageDto[]>('/cms/pages')).data,
  });
  const [editing, setEditing] = useState<{ slug: string; title: string; blocks: string; seoTitle: string; seoDescription: string; status: string } | null>(null);

  const save = async () => {
    if (editing === null || editing.title.trim() === '') return;
    let blocks: unknown;
    try {
      blocks = editing.blocks.trim() === '' ? [] : JSON.parse(editing.blocks);
    } catch {
      toast({ title: 'Blocks must be valid JSON', variant: 'error' });
      return;
    }
    try {
      if (editing.slug === '') {
        await adminApi.upsertCmsPage({ slug: undefined, title: editing.title.trim(), blocks, seoTitle: editing.seoTitle || null, seoDescription: editing.seoDescription || null, status: editing.status });
      } else {
        await adminApi.updateCmsPage(editing.slug, { title: editing.title.trim(), blocks, seoTitle: editing.seoTitle || null, seoDescription: editing.seoDescription || null, status: editing.status });
      }
      toast({ title: 'Page saved', variant: 'success' });
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'cms-pages'] });
    } catch (error) {
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    }
  };

  return (
    <section aria-labelledby="pages-heading" className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="pages-heading" className="text-sm font-bold uppercase tracking-wide text-muted">CMS pages</h2>
        <Button variant="outline" size="sm" onClick={() => setEditing({ slug: '', title: '', blocks: '[]', seoTitle: '', seoDescription: '', status: 'PUBLISHED' })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New page
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-tile border border-line text-sm">
        {(listQuery.data ?? []).map((page) => (
          <li key={page.slug} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{page.title}</span>
              <span className="ms-2 text-xs text-muted">/e/{page.slug} · {page.status}</span>
            </span>
            <button
              type="button"
              className="text-xs font-bold text-brand underline underline-offset-2"
              onClick={() => setEditing({ slug: page.slug, title: page.title, blocks: JSON.stringify(page.blocks, null, 2), seoTitle: page.seoTitle ?? '', seoDescription: page.seoDescription ?? '', status: page.status })}
            >
              Edit
            </button>
          </li>
        ))}
      </ul>

      {editing ? (
        <div className="mt-3 grid gap-3 rounded-tile border border-brand/50 p-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Title *</span>
            <Input value={editing.title} onChange={(event) => setEditing((prev) => prev && { ...prev, title: event.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Status</span>
            <Select value={editing.status} onValueChange={(value) => setEditing((prev) => prev && { ...prev, status: value })} options={['PUBLISHED', 'DRAFT'].map((value) => ({ value, label: value }))} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">SEO title</span>
            <Input value={editing.seoTitle} onChange={(event) => setEditing((prev) => prev && { ...prev, seoTitle: event.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">SEO description</span>
            <Input value={editing.seoDescription} onChange={(event) => setEditing((prev) => prev && { ...prev, seoDescription: event.target.value })} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Blocks (JSON array — hero, rich-text, image-text, cards, product-carousel, faq, cta, video)</span>
            <Textarea rows={10} className="font-mono text-xs" value={editing.blocks} onChange={(event) => setEditing((prev) => prev && { ...prev, blocks: event.target.value })} />
          </label>
          <div className="sm:col-span-2">
            <Button variant="primary" size="sm" onClick={() => void save()}>
              <Save className="h-4 w-4" aria-hidden="true" />
              Save page
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ContentView() {
  return (
    <div>
      <AdminPageHeader title="Banners &amp; pages" />
      <BannersPanel />
      <PagesPanel />
    </div>
  );
}
