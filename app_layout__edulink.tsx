/*
  Copy this file to: app/layout.tsx (Next.js App Router)
  Dependencies: next, react, @supabase/supabase-js, framer-motion (optional)
*/

import React from 'react';
import './globals.css';
import Footer from './components/Footer';

export const metadata = {
  title: 'EDULINK',
  description: 'EDULINK Multi-Tenant School Management Platform'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="edulink-root">
          <header className="top-rail">
            <div className="brand">EDULINK</div>
            <nav className="top-actions">
              {/* Role switcher and user menu go here */}
            </nav>
          </header>

          <main className="app-shell">
            <aside className="side-rail" aria-hidden={false}>
              {/* Collapsible nav icons + labels */}
              <ul className="nav-list">
                <li className="nav-item">Dashboard</li>
                <li className="nav-item">Attendance</li>
                <li className="nav-item">Assignments</li>
                <li className="nav-item">Cases</li>
              </ul>
            </aside>

            <section className="content-area">
              {children}
            </section>
          </main>

          <Footer />
        </div>
      </body>
    </html>
  );
}
