'use client';

// Quick order page (spec 6.10): three tabs — Enter article number (rows with
// live validation), Import CSV file (template download, upload, per-row
// preview, add all valid), Fill out order form (paste "articleNo;qty" lines).
import { useMemo, useRef, useState } from 'react';
import { Download, FileUp, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, Input, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { cartApi } from '@/features/cart/cart-api';
import { useCart } from '@/features/cart/use-cart';
import { formatInr } from '@/lib/format';
import type { QuickOrderLineResult } from '@/shared/dto/order.dto';

interface Row {
  key: number;
  articleNo: string;
  quantity: string;
}

let rowSeq = 0;
function newRow(): Row {
  rowSeq += 1;
  return { key: rowSeq, articleNo: '', quantity: '1' };
}

/** Renders per-row validation results under a tab body. */
function ResultList({ results }: { results: QuickOrderLineResult[] }) {
  if (results.length === 0) return null;
  return (
    <ul className="mt-4 divide-y divide-line rounded-tile border border-line text-sm">
      {results.map((result, index) => (
        <li key={index} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="min-w-0">
            <span className="block truncate font-medium">{result.variant?.productName ?? result.articleNo}</span>
            {result.ok && result.variant ? (
              <span className="text-xs text-muted">
                Article no.: {result.variant.articleNo} · {formatInr(result.variant.unitPrice)} each ·{' '}
                {result.variant.stockQty > 0 ? `${result.variant.stockQty} in stock` : 'backorder'}
              </span>
            ) : (
              <span className="text-xs text-stock-red">{result.error?.message}</span>
            )}
          </span>
          {result.ok ? (
            <span className="shrink-0 text-xs text-muted">qty {result.adjustedQuantity}</span>
          ) : (
            <span className="shrink-0 text-xs font-bold text-stock-red">not added</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function QuickOrderView() {
  const { data: cart } = useCart();
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow()]);
  const [results, setResults] = useState<QuickOrderLineResult[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [pasteResults, setPasteResults] = useState<QuickOrderLineResult[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filledRows = useMemo(
    () => rows.filter((row) => row.articleNo.trim() !== '').map((row) => ({
      articleNo: row.articleNo.trim(),
      quantity: Math.max(1, Number(row.quantity) || 1),
    })),
    [rows],
  );

  const validateRows = async (lines: Array<{ articleNo: string; quantity: number }>): Promise<QuickOrderLineResult[]> => {
    if (lines.length === 0) {
      toast({ title: 'Enter at least one article number', variant: 'info' });
      return [];
    }
    setBusy(true);
    try {
      return await cartApi.validateQuickOrder(lines);
    } catch (error) {
      toast({ title: 'Validation failed', description: error instanceof Error ? error.message : undefined, variant: 'error' });
      return [];
    } finally {
      setBusy(false);
    }
  };

  const addLines = async (lines: Array<{ articleNo: string; quantity: number }>) => {
    if (lines.length === 0) return;
    setBusy(true);
    try {
      const { cart: updatedCart, results: addResults } = await cartApi.importCsv({ lines });
      const ok = addResults.filter((r) => r.ok).length;
      const failed = addResults.filter((r) => !r.ok);
      toast({
        title: `${ok} ${ok === 1 ? 'line' : 'lines'} added to the cart`,
        description: failed.length > 0 ? `${failed.length} could not be added.` : undefined,
        variant: ok > 0 ? 'success' : 'error',
      });
      if (updatedCart.warnings.length > 0) {
        for (const warning of updatedCart.warnings.slice(0, 3)) toast({ title: warning.message, variant: 'info' });
      }
    } catch (error) {
      toast({ title: 'Import failed', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const parsePaste = () =>
    pasteText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
      .map((line) => {
        const parts = line.split(/[;,\t]/).map((part) => part.trim());
        const articleNo = parts[0] ?? '';
        const qty = parts[1] ?? '';
        return { articleNo, quantity: Math.max(1, Number(qty) || 1) };
      })
      .filter((line) => line.articleNo !== '');

  const handleFile = async (file: File) => {
    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
      .map((line) => {
        const parts = line.split(/[;,\t]/).map((part) => part.trim());
        const articleNo = parts[0] ?? '';
        const qty = parts[1] ?? '';
        return { articleNo, quantity: Math.max(1, Number(qty) || 1) };
      })
      .filter((line) => line.articleNo !== '');
    if (lines.length === 0) {
      toast({ title: 'No rows found in the file', variant: 'error' });
      return;
    }
    const validated = await validateRows(lines);
    setPasteResults(validated);
  };

  const downloadTemplate = () => {
    const blob = new Blob(['article_no;quantity\n111100 0,5;10\n111100 5;2\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'quick-order-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pb-16">
      <h1 className="text-2xl font-bold lg:text-[40px]">Quick order</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Order by article number — availability and your prices are checked live. Your cart currently holds{' '}
        {cart?.itemCount ?? 0} items.
      </p>

      <Tabs defaultValue="article" className="mt-8">
        <TabsList>
          <TabsTrigger value="article">Enter article number</TabsTrigger>
          <TabsTrigger value="csv">Import CSV file</TabsTrigger>
          <TabsTrigger value="form">Fill out order form</TabsTrigger>
        </TabsList>

        {/* Tab 1 — rows */}
        <TabsContent value="article" className="mt-6">
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={row.key} className="flex items-center gap-2">
                <Input
                  value={row.articleNo}
                  onChange={(event) =>
                    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, articleNo: event.target.value } : r)))
                  }
                  placeholder={index === 0 ? 'Article no., e.g. 111100 0,5' : 'Article no.'}
                  aria-label={`Article number row ${index + 1}`}
                  className="flex-1"
                />
                <Input
                  value={row.quantity}
                  onChange={(event) =>
                    setRows((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, quantity: event.target.value.replace(/[^0-9]/g, '') } : r)),
                    )
                  }
                  inputMode="numeric"
                  aria-label={`Quantity row ${index + 1}`}
                  className="w-24"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove row ${index + 1}`}
                  onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : prev))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, newRow()])}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add row
            </Button>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => setResults(await validateRows(filledRows))}
            >
              Check availability
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void addLines(filledRows)}>
              Add to shopping cart
            </Button>
          </div>
          <ResultList results={results} />
        </TabsContent>

        {/* Tab 2 — CSV */}
        <TabsContent value="csv" className="mt-6">
          <div className="rounded-tile border border-dashed border-line bg-tile p-8 text-center">
            <FileUp className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">Upload a CSV with article_no;quantity rows</p>
            <p className="mt-1 text-xs text-muted">
              One line per article — unknown numbers are reported and skipped, never silently dropped.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = '';
              }}
            />
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Download template
              </Button>
              <Button variant="primary" size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
                Choose file
              </Button>
            </div>
          </div>
          <ResultList results={pasteResults} />
          {pasteResults.length > 0 ? (
            <div className="mt-4">
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void addLines(parsePaste().length > 0 ? parsePaste() : pasteResults.filter((r) => r.ok && r.variant).map((r) => ({ articleNo: r.articleNo, quantity: r.adjustedQuantity ?? 1 })))}
              >
                Add all valid rows to the cart
              </Button>
            </div>
          ) : null}
        </TabsContent>

        {/* Tab 3 — paste */}
        <TabsContent value="form" className="mt-6">
          <Textarea
            rows={8}
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder={'One line per article:\n111100 0,5;10\n111100 5;2\n# comments start with #'}
            aria-label="Order form — one article number and quantity per line"
          />
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => setPasteResults(await validateRows(parsePaste()))}
            >
              Check lines
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void addLines(parsePaste())}>
              Add to shopping cart
            </Button>
          </div>
          <ResultList results={pasteResults} />
        </TabsContent>
      </Tabs>

      {cart && cart.items.length > 0 ? (
        <div className="mt-10 rounded-tile border border-line bg-tile p-5 text-sm">
          <p className="font-bold">Cart preview</p>
          <ul className="mt-2 space-y-1 text-muted">
            {cart.items.slice(0, 5).map((item) => (
              <li key={item.id}>
                {item.quantity} × {item.productName} (art. {item.articleNo})
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-10">
          <EmptyState title="Nothing in the cart yet" description="Validated lines land here once you add them." />
        </div>
      )}
    </div>
  );
}
