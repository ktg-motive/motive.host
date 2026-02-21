'use client';

interface GreetingBannerProps {
  firstName: string;
  siteCount: number;
  healthySiteCount: number;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function GreetingBanner({
  firstName,
  siteCount,
  healthySiteCount,
}: GreetingBannerProps) {
  const greeting = getGreeting();

  return (
    <div className="mb-8">
      <h1 className="font-display text-2xl font-bold text-muted-white sm:text-3xl">
        {greeting}, {firstName}.
      </h1>
      {siteCount > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate">
          <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
          {healthySiteCount} of {siteCount} {siteCount === 1 ? 'site' : 'sites'} running
        </p>
      )}
    </div>
  );
}
