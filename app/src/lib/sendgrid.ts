import sgMail from '@sendgrid/mail'

const apiKey = process.env.SENDGRID_API_KEY
if (apiKey) {
  sgMail.setApiKey(apiKey)
}

const FROM_EMAIL = 'noreply@motive.host'
const FROM_NAME = 'Motive Hosting'

export async function sendRegistrationConfirmation(
  email: string,
  domain: string,
  expiresAt: string
) {
  if (!apiKey) {
    console.warn('SendGrid API key not configured — skipping email')
    return
  }

  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  await sgMail.send({
    to: email,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `Domain Registered: ${domain}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #1F2329; font-size: 24px; margin-bottom: 24px;">Domain Registered</h1>
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Your domain <strong style="color: #D4AF37;">${domain}</strong> has been registered successfully.
        </p>
        <div style="background: #f7f8fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: #4a5568; font-size: 14px;">
            <strong>Domain:</strong> ${domain}<br>
            <strong>Expires:</strong> ${expiryDate}
          </p>
        </div>
        <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
          Manage your domain at <a href="https://my.motive.host/domains" style="color: #D4AF37;">my.motive.host</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
        <p style="color: #a0aec0; font-size: 12px;">
          Motive Hosting &mdash; Gulf Coast Business Hosting
        </p>
      </div>
    `,
  })
}

export async function sendWelcomeHostingEmail(
  email: string,
  name: string,
  plan: string,
  appName: string,
  primaryDomain: string,
) {
  if (!apiKey) {
    console.warn('SendGrid API key not configured — skipping welcome email')
    return
  }

  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)

  await sgMail.send({
    to: email,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `Your ${appName} site is ready on Motive Hosting`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #1F2329; font-size: 24px; margin-bottom: 24px;">Your site is ready</h1>
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Hi ${name || 'there'},
        </p>
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Your <strong style="color: #D4AF37;">${appName}</strong> site has been set up on Motive Hosting and is now visible in your Customer Hub.
        </p>
        <div style="background: #f7f8fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: #4a5568; font-size: 14px; line-height: 1.8;">
            <strong>Site:</strong> ${appName}<br>
            <strong>Domain:</strong> ${primaryDomain}<br>
            <strong>Plan:</strong> ${planLabel}
          </p>
        </div>
        <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
          View your site status, SSL details, and deployment info at your Customer Hub:
        </p>
        <a href="https://my.motive.host/hosting" style="display: inline-block; background: #D4AF37; color: #1F2329; padding: 12px 24px; border-radius: 8px; font-weight: 600; text-decoration: none; margin: 8px 0;">
          Go to My Dashboard
        </a>
        <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin-top: 24px;">
          If you have questions, reply to this email or reach us at <a href="https://motive.host/contact.html" style="color: #D4AF37;">motive.host/contact.html</a>.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
        <p style="color: #a0aec0; font-size: 12px;">
          Motive Hosting &mdash; Gulf Coast Business Hosting
        </p>
      </div>
    `,
  })
}
