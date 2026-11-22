'use client';

// "Downloads & documents" tab (spec 6.4): datasheets, CAD files, manuals and
// certificates with a file-type icon, title and size; links open in a new tab.
import { Award, BookOpen, Box, File, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DocumentDto } from '@/shared/dto/product.dto';

const KIND_META: Record<DocumentDto['kind'], { label: string; Icon: LucideIcon }> = {
  DATASHEET: { label: 'Datasheet', Icon: FileText },
  CAD: { label: 'CAD', Icon: Box },
  MANUAL: { label: 'Manual', Icon: BookOpen },
  CERTIFICATE: { label: 'Certificate', Icon: Award },
  OTHER: { label: 'Document', Icon: File },
};

/** "148 KB" / "2.3 MB" / "—" for missing sizes. */
export function formatFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null || sizeBytes < 0) return '—';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface DownloadsTabProps {
  documents: DocumentDto[];
}

export function DownloadsTab({ documents }: DownloadsTabProps) {
  if (documents.length === 0) {
    return <p className="text-sm text-muted">No documents available for this product.</p>;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {documents.map((doc) => {
        const meta = KIND_META[doc.kind];
        return (
          <li key={`${doc.kind}-${doc.title}`}>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-tile border border-line bg-white px-4 py-3 transition-colors hover:border-brand"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-tile text-ink">
                <meta.Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{doc.title}</span>
                <span className="block text-xs text-muted">
                  {meta.label} · {formatFileSize(doc.sizeBytes)}
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
