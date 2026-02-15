import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-6xl font-bold text-gold">404</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-muted-white">Page not found</h1>
        <p className="mt-3 text-sm text-slate">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-gold px-6 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
