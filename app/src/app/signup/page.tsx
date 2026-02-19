import { redirect } from 'next/navigation'

// Self-serve signup is closed. Accounts are created by Motive Hosting staff
// after a client signs up for a hosting plan via motive.host/contact.html.
export default function SignupPage() {
  redirect('https://motive.host/contact.html')
}
