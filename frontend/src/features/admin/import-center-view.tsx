'use client';

// Import Center (spec 16.1): template download, upload with options, live
// job list (polled while anything is in flight), validation report with a
// filterable issue table + downloadable error xlsx, commit with confirmation
// and ADMIN-gated rollback.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { Badge, Button, Checkbox, Modal, Select, Skeleton } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { adminApi, type ImportOptionsDto } from './admin-api';
import { AdminPageHeader } from './admin-shell';
import { getAccessToken } from '@/features/auth/auth-store';

const STATUS_VARIANT: Record<string, 'brand' | 'neutral'> = {
  READY_TO_COMMIT: 'brand',
  COMPLETED: 'brand',
  COMMITTING: 'brand',
  VALIDATED_WITH_ERRORS: 'neutral',
  FAILED: 'neutral',
  ROLLED_BACK: 'neutral',
  CANCELLED: 'neutral',
};

const DEFAULT_OPTIONS: ImportOptionsDto = {
  onDuplicateArticleNo: 'UPDATE',
  createMissingBrands: false,
  publishStatus: 'DRAFT',
  strictImages: false,
};

/** Bearer-authenticated binary download (template + error report). */
async function downloadFile(path: string, fileName: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(path, { headers: token !== null ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function ImportCenterView({ role }: { role: 'ADMIN' | 'STAFF' }) {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [options, setOptions] = useState<ImportOptionsDto>(DEFAULT_OPTIONS);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'commit' | 'rollback' | 'cancel'; jobId: string } | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'' | 'ERROR' | 'WARNING'>('');

  const jobsQuery = useQuery({
    queryKey: ['admin', 'imports'],
    queryFn: () => adminApi.listImports({ page: 1, pageSize: 20 }),
    // Live progress: poll while anything is in flight.
    refetchInterval: (query) =>
      (query.state.data?.data ?? []).some((job) => ['UPLOADED', 'PARSING', 'VALIDATING', 'COMMITTING'].includes(job.status))
        ? 1500
        : false,
  });

  const detailQuery = useQuery({
    queryKey: ['admin', 'imports', selectedJobId, severityFilter],
    queryFn: () =>
      adminApi.importDetail(selectedJobId!, {
        issuePage: 1,
        issuePageSize: 100,
        ...(severityFilter !== '' ? { severity: severityFilter } : {}),
      }),
    enabled: selectedJobId !== null,
    // The report panel must follow a running job: the upload endpoint returns
    // before the queued dry run finishes, so the first detail fetch can catch
    // an in-flight job (empty stats) — without polling the panel would stay
    // stale forever while the jobs table beside it keeps updating.
    refetchInterval: (query) => {
      const status = query.state.data?.data?.job.status;
      return status !== undefined &&
        ['UPLOADED', 'PARSING', 'VALIDATING', 'COMMITTING'].includes(status)
        ? 1500
        : false;
    },
  });

  const selected = useMemo(() => detailQuery.data?.data ?? null, [detailQuery.data]);

  const handleUpload = async (file: File): Promise<void> => {
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      const mode = file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX';
      const result = await adminApi.uploadImport({
        fileName: file.name,
        contentBase64: btoa(binary),
        mode,
        options,
      });
      toast({ variant: 'success', title: 'Dry run finished', description: `Job ${result.data.jobId.slice(-8)} validated.` });
      setSelectedJobId(result.data.jobId);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'imports'] });
    } catch (error) {
      toast({ variant: 'error', title: 'Upload failed', description: (error as Error).message });
    } finally {
      setUploading(false);
    }
  };

  const runAction = async (): Promise<void> => {
    if (confirm === null) return;
    const { kind, jobId } = confirm;
    try {
      if (kind === 'commit') {
        await adminApi.commitImport(jobId);
        toast({ variant: 'success', title: 'Commit started', description: 'Watch the job status for progress.' });
      } else if (kind === 'rollback') {
        const result = await adminApi.rollbackImport(jobId);
        toast({ variant: 'success', title: 'Rollback complete', description: `${result.data.restored} rows restored.` });
      } else {
        await adminApi.cancelImport(jobId);
        toast({ variant: 'success', title: 'Job cancelled' });
      }
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'imports'] });
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (error) {
      toast({ variant: 'error', title: 'Action failed', description: (error as Error).message });
    }
  };

  return (
    <div>
      <AdminPageHeader title="Import Center">
        <Button variant="outline" size="sm" onClick={() => void downloadFile('/api/v1/admin/imports/template', 'toolhub-import-template.xlsx')}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Download template
        </Button>
      </AdminPageHeader>

      <section className="mb-8 rounded-tile border border-line bg-tile p-4" aria-label="Upload an import file">
        <h2 className="mb-1 text-sm font-bold text-ink">Upload a file (.xlsx or .csv, max 25 MB)</h2>
        <p className="mb-3 text-xs text-muted">
          A dry run validates everything first — nothing is written until you press Commit on a green report.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs">
            <span className="mb-1 block text-muted">On duplicate article no.</span>
            <Select
              value={options.onDuplicateArticleNo}
              onValueChange={(value) => setOptions((prev) => ({ ...prev, onDuplicateArticleNo: value as ImportOptionsDto['onDuplicateArticleNo'] }))}
              options={[
                { value: 'UPDATE', label: 'Update existing' },
                { value: 'SKIP', label: 'Skip the row' },
                { value: 'FAIL', label: 'Treat as error' },
              ]}
              aria-label="On duplicate article no."
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">Publish status</span>
            <Select
              value={options.publishStatus}
              onValueChange={(value) => setOptions((prev) => ({ ...prev, publishStatus: value as 'DRAFT' | 'PUBLISHED' }))}
              options={[
                { value: 'DRAFT', label: 'Import as drafts' },
                { value: 'PUBLISHED', label: 'Respect file status' },
              ]}
              aria-label="Publish status"
            />
          </label>
          <label className="flex items-center gap-2 pt-5 text-xs text-ink">
            <Checkbox
              checked={options.createMissingBrands}
              onCheckedChange={(value) => setOptions((prev) => ({ ...prev, createMissingBrands: value === true }))}
              aria-label="Create missing brands"
            />
            Create missing brands
          </label>
          <label className="flex items-center gap-2 pt-5 text-xs text-ink">
            <Checkbox
              checked={options.strictImages}
              onCheckedChange={(value) => setOptions((prev) => ({ ...prev, strictImages: value === true }))}
              aria-label="Strict images"
            />
            Strict images (fail on fetch errors)
          </label>
        </div>
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-tile border-2 border-dashed border-line bg-white p-6 text-center transition-colors hover:border-brand">
          <Upload className="h-6 w-6 text-brand" aria-hidden="true" />
          <span className="text-sm font-bold text-ink">{uploading ? 'Uploading and validating…' : 'Choose a file or drop it here'}</span>
          <span className="text-xs text-muted">The dry run runs immediately after the upload.</span>
          <input
            type="file"
            accept=".xlsx,.csv"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) void handleUpload(file);
              event.target.value = '';
            }}
          />
        </label>
      </section>

      <section aria-label="Import jobs">
        <h2 className="mb-3 text-sm font-bold text-ink">Jobs</h2>
        {jobsQuery.isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="overflow-x-auto rounded-tile border border-line">
            <table className="w-full text-sm">
              <thead className="bg-tile text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-bold">File</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold">Errors</th>
                  <th className="px-4 py-2.5 font-bold">Plan (create/update/skip)</th>
                  <th className="px-4 py-2.5 font-bold">Uploaded by</th>
                  <th className="px-4 py-2.5 font-bold">Date</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {(jobsQuery.data?.data ?? []).map((job) => (
                  <tr
                    key={job.id}
                    className={selectedJobId === job.id ? 'bg-brand/5' : 'hover:bg-tile/60'}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <td className="px-4 py-2.5 font-medium text-ink">
                      <FileSpreadsheet className="me-2 inline h-4 w-4 text-muted" aria-hidden="true" />
                      {job.fileName}
                      {/* Short job id: lets admins (and e2e) reference a job unambiguously. */}
                      <span
                        data-job-id={job.id}
                        title={job.id}
                        className="ms-2 font-mono text-[10px] font-normal text-muted"
                      >
                        {job.id.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={STATUS_VARIANT[job.status] ?? 'neutral'}>{job.status.replaceAll('_', ' ').toLowerCase()}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      {job.stats?.errors ?? 0} err · {job.stats?.warnings ?? 0} warn
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {job.stats?.create ?? 0} / {job.stats?.update ?? 0} / {job.stats?.skip ?? 0}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">{job.createdByEmail ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{new Date(job.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        className="text-xs font-bold text-brand underline underline-offset-2"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedJobId(job.id);
                        }}
                      >
                        Report
                      </button>
                    </td>
                  </tr>
                ))}
                {(jobsQuery.data?.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted">
                      No imports yet — upload a workbook above.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected !== null ? (
        <section className="mt-6" aria-label="Validation report">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-ink">Report — {selected.job.fileName}</h2>
            <Select
              value={severityFilter}
              onValueChange={(value) => setSeverityFilter(value as '' | 'ERROR' | 'WARNING')}
              options={[
                { value: '', label: 'All issues' },
                { value: 'ERROR', label: 'Errors only' },
                { value: 'WARNING', label: 'Warnings only' },
              ]}
              aria-label="Filter issues by severity"
              className="w-40"
            />
            <div className="ms-auto flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void downloadFile(`/api/v1/admin/imports/${selected.job.id}/report`, `import-errors-${selected.job.id}.xlsx`)}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Error report (.xlsx)
              </Button>
              {selected.job.status === 'READY_TO_COMMIT' ? (
                <Button variant="primary" size="sm" onClick={() => setConfirm({ kind: 'commit', jobId: selected.job.id })}>
                  Commit import
                </Button>
              ) : null}
              {selected.job.status === 'COMPLETED' && role === 'ADMIN' ? (
                <Button variant="navy" size="sm" onClick={() => setConfirm({ kind: 'rollback', jobId: selected.job.id })}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Roll back
                </Button>
              ) : null}
              {['UPLOADED', 'PARSING', 'VALIDATING', 'VALIDATED_WITH_ERRORS', 'READY_TO_COMMIT'].includes(selected.job.status) ? (
                <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: 'cancel', jobId: selected.job.id })}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
            <span><strong className="text-ink">{selected.job.stats?.create ?? 0}</strong> will create</span>
            <span><strong className="text-ink">{selected.job.stats?.update ?? 0}</strong> will update</span>
            <span><strong className="text-ink">{selected.job.stats?.skip ?? 0}</strong> skipped</span>
            <span className="text-stock-red"><strong>{selected.job.stats?.errors ?? 0}</strong> errors</span>
            <span><strong>{selected.job.stats?.warnings ?? 0}</strong> warnings</span>
          </div>

          <div className="overflow-x-auto rounded-tile border border-line">
            <table className="w-full text-sm">
              <thead className="bg-tile text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Sheet</th>
                  <th className="px-4 py-2.5 font-bold">Row</th>
                  <th className="px-4 py-2.5 font-bold">Column</th>
                  <th className="px-4 py-2.5 font-bold">Severity</th>
                  <th className="px-4 py-2.5 font-bold">Code</th>
                  <th className="px-4 py-2.5 font-bold">Message</th>
                  <th className="px-4 py-2.5 font-bold">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {selected.issues.map((issue) => (
                  <tr key={issue.id}>
                    <td className="px-4 py-2.5">{issue.sheet}</td>
                    <td className="px-4 py-2.5">{issue.rowNumber}</td>
                    <td className="px-4 py-2.5">{issue.column ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          issue.severity === 'ERROR'
                            ? 'text-xs font-bold text-stock-red'
                            : 'text-xs font-bold text-muted'
                        }
                      >
                        {issue.severity.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{issue.code}</td>
                    <td className="px-4 py-2.5">{issue.message}</td>
                    <td className="px-4 py-2.5 max-w-40 truncate font-mono text-xs text-muted">{issue.rawValue ?? '—'}</td>
                  </tr>
                ))}
                {selected.issues.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted">
                      {selected.job.status === 'READY_TO_COMMIT'
                        ? 'No issues — the import is ready to commit.'
                        : 'No issues match the filter.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <Modal
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={
          confirm === null
            ? ''
            : confirm.kind === 'commit'
              ? 'Commit this import?'
              : confirm.kind === 'rollback'
                ? 'Roll back this import?'
                : 'Cancel this job?'
        }
      >
        <p className="text-sm text-muted">
          {confirm?.kind === 'commit'
            ? 'The planned rows are written in batches of 500 per transaction with progress on the job. Every change is snapshotted for rollback.'
            : confirm?.kind === 'rollback'
              ? 'All rows touched by this import are restored to their previous state. This cannot be undone (but a fresh import can re-apply the file).'
              : 'The job stops at its current state. You can re-upload the file afterwards.'}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button variant={confirm?.kind === 'rollback' ? 'navy' : 'primary'} size="sm" onClick={() => void runAction()}>
            {confirm?.kind === 'commit' ? 'Commit' : confirm?.kind === 'rollback' ? 'Roll back' : 'Cancel job'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
