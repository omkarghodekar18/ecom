// Central URL builders — the single place that knows the /{country}/{lang} base.
export type LocalePath = string; // e.g. "/in/en"

export function routes(locale: LocalePath) {
  const base = locale.startsWith('/') ? locale : `/${locale}`;
  return {
    home: base,
    category: (pathSlugs: string, code: string) => `${base}/${pathSlugs}/c/${code}`,
    product: (productSlug: string, articleNo: string) => `${base}/p/${productSlug}-${slugifyArticleNo(articleNo)}`,
    search: `${base}/search`,
    brands: `${base}/brands`,
    brand: (slug: string) => `${base}/brands/${slug}`,
    cms: (slug: string) => `${base}/e/${slug}`,
    cart: `${base}/cart`,
    checkout: `${base}/checkout`,
    checkoutSuccess: (orderNo: string) => `${base}/checkout/success/${orderNo}`,
    quickOrder: `${base}/quick-order`,
    login: (redirect?: string) =>
      redirect ? `${base}/login?redirect=${encodeURIComponent(redirect)}` : `${base}/login`,
    register: (redirect?: string) =>
      redirect ? `${base}/register?redirect=${encodeURIComponent(redirect)}` : `${base}/register`,
    forgotPassword: `${base}/forgot-password`,
    account: `${base}/my-account`,
    accountSection: (section: string) => `${base}/my-account/${section}`,
    companyOrders: `${base}/my-company/orders`,
    orderDetail: (orderNo: string) => `${base}/my-company/orders/${orderNo}`,
    contact: `${base}/contact`,
    help: `${base}/help`,
    newsletter: `${base}/newsletter`,
  };
}

/** Article numbers contain spaces/commas ("111100 0,5"); URLs need a slug form. */
export function slugifyArticleNo(articleNo: string): string {
  return articleNo
    .trim()
    .toLowerCase()
    .replace(/,/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
