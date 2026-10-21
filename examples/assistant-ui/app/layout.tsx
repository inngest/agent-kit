import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentKit + assistant-ui",
  description: "AgentKit's useAgent hook rendered with assistant-ui",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
