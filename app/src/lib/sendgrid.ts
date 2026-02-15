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
          Manage your domain at <a href="https://domains.motive.host/domains" style="color: #D4AF37;">domains.motive.host</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
        <p style="color: #a0aec0; font-size: 12px;">
          Motive Hosting &mdash; Gulf Coast Business Hosting
        </p>
      </div>
    `,
  })
}
