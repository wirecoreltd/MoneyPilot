import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MoneyPilot',
  description: 'Gérez votre argent avec clarté',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
