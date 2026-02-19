export default function NoPlanPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">

        {/* Logo */}
        <a href="https://motive.host" className="mb-10 inline-block">
          <img
            src="/img/mh-nav-logo.png"
            alt="Motive Hosting"
            width="53"
            height="53"
            className="mx-auto"
          />
        </a>

        {/* Message */}
        <h1 className="font-display text-2xl font-bold text-muted-white sm:text-3xl">
          You need a hosting plan
        </h1>
        <p className="mt-4 text-slate">
          The Motive Hosting Customer Hub is available to active hosting clients.
          Get in touch and we&apos;ll get you set up.
        </p>

        {/* CTA */}
        <a
          href="https://motive.host/contact.html"
          className="mt-8 inline-block rounded-lg bg-gold px-6 py-3 font-medium text-primary-bg transition-colors hover:bg-gold-hover"
        >
          Get Started with Motive Hosting
        </a>

        {/* Already have an account? */}
        <p className="mt-6 text-sm text-slate">
          Already a client?{' '}
          <a href="/login" className="text-gold hover:text-gold-hover">
            Sign in
          </a>
        </p>

      </div>
    </div>
  )
}
