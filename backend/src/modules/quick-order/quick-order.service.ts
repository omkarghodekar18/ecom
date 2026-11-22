// Quick-order service (spec 6.10): resolves article-number lines for the
// quick-entry UI. Pure resolution — adding to the cart goes through the cart
// module's import flow so the rules live in exactly one place.
import { articleNoCandidates } from '../../common/utils/article-no.util.js';
import { applyQuantityRules } from '../cart/index.js';
import { settingsService } from '../../services/settings/index.js';
import type { QuickOrderLineResult, QuickOrderValidateInput } from '../../shared/dto/order.dto.js';
import { mediaUrl } from '../catalog/public-id.util.js';
import { Prisma } from '@prisma/client';
import { quickOrderRepository } from './quick-order.repository.js';

export const quickOrderService = {
  /** POST /quick-order/validate — per-line resolution with current prices/rules. */
  async validate(input: QuickOrderValidateInput): Promise<QuickOrderLineResult[]> {
    const settings = await settingsService.getSettings();
    const candidates = new Set<string>();
    for (const line of input.lines) {
      for (const candidate of articleNoCandidates(line.articleNo)) candidates.add(candidate);
    }
    const variants = await quickOrderRepository.findByArticleNos([...candidates]);
    const byArticleNo = new Map(variants.map((variant) => [variant.articleNo, variant]));

    return input.lines.map((line) => {
      const variant = articleNoCandidates(line.articleNo)
        .map((candidate) => byArticleNo.get(candidate))
        .find((found) => found !== undefined);
      if (variant === undefined) {
        return {
          articleNo: line.articleNo,
          ok: false,
          variant: null,
          adjustedQuantity: null,
          error: { code: 'ARTICLE_NOT_FOUND', message: `No article found for '${line.articleNo}'.` },
        };
      }
      try {
        const applied = applyQuantityRules(line.quantity, variant, settings.stock.policy);
        const image = variant.product.images[0] ?? null;
        return {
          articleNo: line.articleNo,
          ok: true,
          variant: {
            id: variant.id,
            articleNo: variant.articleNo,
            name: variant.name,
            productName: variant.product.name,
            brandName: variant.product.brand.name,
            image: image === null ? null : mediaUrl(image.publicId),
            unitPrice: variant.listPrice.toFixed(2),
            currency: variant.currency,
            minOrderQty: variant.minOrderQty,
            packSize: variant.packSize,
            stockQty: variant.stockQty,
          },
          adjustedQuantity: applied.quantity,
          error: null,
        };
      } catch (err) {
        const code =
          err instanceof Error && 'code' in err ? String((err as { code: string }).code) : 'INVALID';
        return {
          articleNo: line.articleNo,
          ok: false,
          variant: null,
          adjustedQuantity: null,
          error: { code, message: err instanceof Error ? err.message : 'Invalid line' },
        };
      }
    });
  },
};

/** Re-exported for tests: Decimal passthrough keeps money exact. */
export { Prisma };
