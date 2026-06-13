import type { ReactNode } from "react";

export const metadata = {
  title: "DOO Contact Sync",
  description:
    "Production HubSpot two-way contact sync connector: OAuth 2.0, signature-verified webhooks, Postgres sync ledger.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          margin: 0,
          padding: "2rem",
          lineHeight: 1.5,
          color: "#0d1b3e",
        }}
      >
        {children}
      </body>
    </html>
  );
}
