// ============================================================
// EDULINK · Legal compliance footer
// Renders on EVERY page and layout container across the portal.
// Exact three-column structural block — small, sleek typography.
// ============================================================

export function LegalFooter() {
  return (
    <footer className="legal-footer mt-auto">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-6 py-5 text-[11px] leading-relaxed text-ghost md:grid-cols-3 md:gap-8">
        <div>
          <p className="label mb-1 text-[9px]">Platform</p>
          <p className="text-cyan/80">
            © 2026 EDULINK. All Rights Reserved. Hosted securely at k2020.org.za.
          </p>
        </div>
        <div>
          <p className="label mb-1 text-[9px]">Compliance</p>
          <p className="text-ghost">
            This system complies strictly with the Protection of Personal Information Act
            (POPIA), Act No 4 of 2013 of South Africa. Minor children profiles are
            protected via encrypted database row isolation.
          </p>
        </div>
        <div>
          <p className="label mb-1 text-[9px]">Operations</p>
          <p className="text-ghost">
            Platform Operations Director: <span className="text-ink">Michael Stanfliet</span>{" "}
            | Contact: <span className="mono-num text-cyan/80">0615051013</span> | Email:{" "}
            <span className="text-cyan/80">stanfliet@contractor.net</span> | Paarl, Western
            Cape, South Africa.
          </p>
        </div>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan/30 to-transparent" />
    </footer>
  );
}
