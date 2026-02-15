import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <p className="text-xs text-slate">
          &copy; {new Date().getFullYear()} Motive Hosting. All rights reserved.
        </p>
        <div className="flex items-center gap-4 text-xs">
          <Link href="https://motive.host/privacy.html" className="text-slate transition-colors hover:text-muted-white">
            Privacy
          </Link>
          <Link href="https://motive.host/terms.html" className="text-slate transition-colors hover:text-muted-white">
            Terms
          </Link>
          <Link href="https://my.motive.host" className="text-slate transition-colors hover:text-muted-white">
            Hosting Portal
          </Link>
        </div>
      </div>
    </footer>
  )
}
