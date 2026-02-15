export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="flex flex-col items-center gap-6 px-8 text-center">
        <h1 className="font-display text-5xl font-bold tracking-tight text-muted-white">
          Motive Hosting
        </h1>
        <p className="font-mono text-sm tracking-wide text-gold">
          CUSTOMER HUB
        </p>
        <p className="max-w-md text-lg text-slate">
          Domain registration and DNS management for Gulf Coast businesses.
          Coming soon.
        </p>
        <div className="mt-4 rounded-lg border border-border bg-card px-6 py-4">
          <p className="font-mono text-xs text-slate">
            domains.motive.host
          </p>
        </div>
      </main>
    </div>
  );
}
