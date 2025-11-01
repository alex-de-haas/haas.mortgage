import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mortgage Planner',
  description:
    'Visualise the repayment schedule for the Florius Profijt 3+3 mortgage and track early repayments.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
