'use client';

// Media tab (spec 15.2 "Images"/"Documents"): drag-and-drop multi-upload via
// the signed media endpoints (sign-upload → binary upload), replace-list
// editing (kind, alt, variant assignment, sort order, title/url) and save
// through PUT /admin/products/:id/{images|documents}.
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileUp, Save, Trash2 } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { authFetch } from '@/features/auth/with-auth-fetch';
import { getAccessToken } from '@/features/auth/auth-store';
import { adminApi } from '../admin-api';
import type { VariantDto } from '@/shared/dto/product.dto';

interface ImageRow {
  key: number | string;
  publicId: string;
  kind: string;
  alt: string;
  variantId: string;
  sortOrder: number;
}

interface DocumentRow {
  key: number | string;
  kind: string;
  title: string;
  url: string;
  sizeBytes: string;
}

/** sign-upload → {publicId} → binary POST; returns the stored publicId. */
async function uploadFile(file: File, folder: string, resourceType: 'image' | 'raw'): Promise<string> {
  const sign = await authFetch<{ publicId: string }>('/admin/media/sign-upload', {
    method: 'POST',
    body: { folder, resourceType, filename: file.name, mime: file.type },
  });
  const publicId = sign.data.publicId;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const token = getAccessToken();
  const response = await fetch(`/api/v1/admin/media/upload`, {
    method: 'POST',
    headers: {
      'x-public-id': publicId,
      'x-mime': file.type || 'application/octet-stream',
      'Content-Type': 'application/octet-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: bytes,
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
  return publicId;
}

export function MediaTab({
  productId,
  kind,
  items,
  variants,
}: {
  productId: string;
  kind: 'images' | 'documents';
  items: Array<{ id: string; url?: string; alt?: string | null; kind: string; variantId?: string | null; sortOrder?: number; title?: string; sizeBytes?: number | null }>;
  variants: VariantDto[];
}) {
  // Row keys: existing rows reuse their server ids; uploads get ref-based ids
  // (no module-level counter — React lint forbids reassigning outer lets).
  const uploadSeq = useRef(0);
  const nextKey = (fallback: string): number | string => {
    uploadSeq.current += 1;
    return `${fallback}-${uploadSeq.current}`;
  };
  const [images, setImages] = useState<ImageRow[]>(
    kind === 'images'
      ? items.map((item) => ({
          key: item.id,
          publicId: item.id,
          kind: item.kind,
          alt: item.alt ?? '',
          variantId: item.variantId ?? '',
          sortOrder: item.sortOrder ?? 0,
        }))
      : [],
  );
  const [documents, setDocuments] = useState<DocumentRow[]>(
    kind === 'documents'
      ? items.map((item) => ({
          key: item.id,
          kind: item.kind,
          title: item.title ?? '',
          url: item.url ?? '',
          sizeBytes: item.sizeBytes === null || item.sizeBytes === undefined ? '' : String(item.sizeBytes),
        }))
      : [],
  );
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList) => {
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (kind === 'images') {
          const publicId = await uploadFile(file, `catalog/products/${productId}/`, 'image');
          setImages((prev) => [
            ...prev,
            { key: nextKey('img'), publicId, kind: 'PHOTO', alt: file.name.replace(/\.[a-z]+$/i, ''), variantId: '', sortOrder: prev.length },
          ]);
        } else {
          const publicId = await uploadFile(file, `catalog/documents/${productId}/`, 'raw');
          setDocuments((prev) => [...prev, { key: nextKey('doc'), kind: 'DATASHEET', title: file.name, url: `/media/${publicId}`, sizeBytes: String(file.size) }]);
        }
      }
      toast({ title: files.length === 1 ? 'File uploaded' : `${files.length} files uploaded`, variant: 'success' });
    } catch (error) {
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      if (kind === 'images') {
        await adminApi.replaceImages(
          productId,
          images.map((image) => ({
            publicId: image.publicId,
            kind: image.kind,
            alt: image.alt === '' ? null : image.alt,
            variantId: image.variantId === '' ? null : image.variantId,
            sortOrder: image.sortOrder,
          })),
        );
      } else {
        await adminApi.replaceDocuments(
          productId,
          documents.map((doc) => ({
            kind: doc.kind,
            title: doc.title,
            url: doc.url,
            sizeBytes: doc.sizeBytes === '' ? null : Number(doc.sizeBytes),
          })),
        );
      }
      toast({ title: kind === 'images' ? 'Images saved' : 'Documents saved', variant: 'success' });
    } catch (error) {
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="rounded-tile border border-dashed border-line bg-tile p-6 text-center">
        <FileUp className="mx-auto h-7 w-7 text-muted" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium">
          {kind === 'images' ? 'Drop or choose product images' : 'Drop or choose documents (datasheets, CAD, manuals)'}
        </p>
        <p className="mt-1 text-xs text-muted">
          {kind === 'images'
            ? 'Uploaded to catalog/products/… — then assign kind, alt text and a variant below.'
            : 'Uploaded to catalog/documents/… — then set kind, title and size.'}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          accept={kind === 'images' ? 'image/*' : '.pdf,.dwg,.dxf,.step,.stp,.zip'}
          onChange={(event) => {
            if (event.target.files?.length) void handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <div className="mt-3">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            Choose files
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {kind === 'images'
          ? images.map((image, index) => (
              <div key={image.key} className="grid items-center gap-2 rounded-tile border border-line p-3 sm:grid-cols-[64px_1fr_150px_150px_80px_auto]">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of a /media URL */}
                <img src={`/media/${image.publicId}`} alt="" className="h-16 w-16 rounded-sm bg-tile object-contain" />
                <div className="grid gap-2">
                  <Input
                    value={image.alt}
                    aria-label="Alt text"
                    placeholder="Alt text"
                    onChange={(event) => setImages((prev) => prev.map((row, i) => (i === index ? { ...row, alt: event.target.value } : row)))}
                  />
                  <p className="truncate text-xs text-muted">{image.publicId}</p>
                </div>
                <Select
                  value={image.kind}
                  aria-label="Image kind"
                  options={['PHOTO', 'DRAWING', 'TECHNICAL', 'OTHER'].map((value) => ({ value, label: value }))}
                  onValueChange={(value) => setImages((prev) => prev.map((row, i) => (i === index ? { ...row, kind: value } : row)))}
                />
                <Select
                  value={image.variantId}
                  aria-label="Assigned variant"
                  options={[{ value: '', label: 'All variants' }, ...variants.map((variant) => ({ value: variant.id, label: variant.articleNo }))]}
                  onValueChange={(value) => setImages((prev) => prev.map((row, i) => (i === index ? { ...row, variantId: value } : row)))}
                />
                <Input
                  type="number"
                  value={image.sortOrder}
                  aria-label="Sort order"
                  onChange={(event) => setImages((prev) => prev.map((row, i) => (i === index ? { ...row, sortOrder: Number(event.target.value) } : row)))}
                />
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Move up"
                    onClick={() =>
                      setImages((prev) => {
                        if (index === 0) return prev;
                        const next = [...prev];
                        [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                        return next;
                      })
                    }
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Move down"
                    onClick={() =>
                      setImages((prev) => {
                        if (index === prev.length - 1) return prev;
                        const next = [...prev];
                        [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                        return next;
                      })
                    }
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Remove image" onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))
          : documents.map((doc, index) => (
              <div key={doc.key} className="grid items-center gap-2 rounded-tile border border-line p-3 sm:grid-cols-[150px_1fr_1fr_100px_auto]">
                <Select
                  value={doc.kind}
                  aria-label="Document kind"
                  options={['DATASHEET', 'CAD', 'MANUAL', 'CERTIFICATE', 'OTHER'].map((value) => ({ value, label: value }))}
                  onValueChange={(value) => setDocuments((prev) => prev.map((row, i) => (i === index ? { ...row, kind: value } : row)))}
                />
                <Input
                  value={doc.title}
                  aria-label="Title"
                  placeholder="Title"
                  onChange={(event) => setDocuments((prev) => prev.map((row, i) => (i === index ? { ...row, title: event.target.value } : row)))}
                />
                <Input
                  value={doc.url}
                  aria-label="URL"
                  placeholder="URL (https… or /media/…)"
                  onChange={(event) => setDocuments((prev) => prev.map((row, i) => (i === index ? { ...row, url: event.target.value } : row)))}
                />
                <Input
                  type="number"
                  value={doc.sizeBytes}
                  aria-label="Size in bytes"
                  placeholder="bytes"
                  onChange={(event) => setDocuments((prev) => prev.map((row, i) => (i === index ? { ...row, sizeBytes: event.target.value } : row)))}
                />
                <Button variant="ghost" size="sm" aria-label="Remove document" onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== index))}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
      </div>

      <div className="mt-4">
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Working…' : kind === 'images' ? 'Save images' : 'Save documents'}
        </Button>
        <p className="mt-2 text-xs text-muted">
          Saving replaces the whole list on the product (PUT semantics) — remove rows here to delete assignments.
        </p>
      </div>
    </div>
  );
}
