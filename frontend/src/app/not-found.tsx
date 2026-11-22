import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="page-container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-5xl font-bold text-brand">404</p>
      <h1 className="mt-4 text-2xl font-bold">We could not find this page</h1>
      <p className="mt-2 max-w-md text-muted">
        The page may have moved, or the link is outdated. Browse the assortment instead.
      </p>
      <Link
        href="/in/en"
        className="mt-6 rounded-btn bg-brand px-6 py-3 font-bold text-white transition-colors hover:bg-brand-hover"
      >
        To the homepage
      </Link>
    </main>
  );
}
