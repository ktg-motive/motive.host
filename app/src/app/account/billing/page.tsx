import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import Card from '@/components/ui/card';

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'paid') {
    return (
      <span className="inline-block rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
        Paid
      </span>
    );
  }
  if (status === 'open') {
    return (
      <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
        Open
      </span>
    );
  }
  if (status === 'void') {
    return (
      <span className="inline-block rounded-full bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
        Void
      </span>
    );
  }
  if (status === 'uncollectible') {
    return (
      <span className="inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
        Uncollectible
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
      {status}
    </span>
  );
}

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  const stripeCustomerId = customer?.stripe_customer_id;

  // Fetch invoices from Stripe if we have a customer ID
  let invoices: {
    id: string;
    created: number;
    description: string | null;
    amount_due: number;
    status: string;
    invoice_pdf: string | null;
  }[] = [];

  if (stripeCustomerId) {
    try {
      const invoiceList = await stripe.invoices.list({
        customer: stripeCustomerId,
        limit: 24,
      });

      invoices = invoiceList.data.map((inv) => ({
        id: inv.id,
        created: inv.created,
        description: inv.description ?? (inv.lines.data[0]?.description ?? null),
        amount_due: inv.amount_due,
        status: inv.status ?? 'unknown',
        invoice_pdf: inv.invoice_pdf ?? null,
      }));
    } catch (err) {
      console.error('Failed to fetch invoices from Stripe:', err);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <Link
          href="/account"
          className="mb-4 inline-flex items-center text-sm text-slate transition-colors hover:text-gold"
        >
          &larr; Back to Account
        </Link>
        <h1 className="font-display text-3xl font-bold text-muted-white">
          Billing History
        </h1>
        <p className="mt-1 text-sm text-slate">
          Your invoices and payment history.
        </p>
      </div>

      {!stripeCustomerId ? (
        <Card className="py-12 text-center">
          <p className="text-slate">
            No billing history yet — contact support if you have questions about your invoice.
          </p>
          <a
            href="https://motive.host/contact.html?subject=billing"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-sm text-gold transition-colors hover:text-gold-hover"
          >
            Contact Support
          </a>
        </Card>
      ) : invoices.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-slate">No invoices yet.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Desktop table */}
          <div className="hidden sm:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate">
                    Description
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate">
                    Invoice
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="transition-colors hover:bg-card-content">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-white">
                      {formatDate(inv.created)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate">
                      {inv.description ?? 'Invoice'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-muted-white">
                      {formatAmount(inv.amount_due)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {inv.invoice_pdf ? (
                        <a
                          href={inv.invoice_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gold transition-colors hover:text-gold-hover"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-sm text-slate/50">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout */}
          <div className="divide-y divide-border sm:hidden">
            {invoices.map((inv) => (
              <div key={inv.id} className="px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-white">
                    {formatDate(inv.created)}
                  </span>
                  <StatusBadge status={inv.status} />
                </div>
                <p className="mt-1 text-sm text-slate">
                  {inv.description ?? 'Invoice'}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-white">
                    {formatAmount(inv.amount_due)}
                  </span>
                  {inv.invoice_pdf ? (
                    <a
                      href={inv.invoice_pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gold transition-colors hover:text-gold-hover"
                    >
                      Download PDF
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
