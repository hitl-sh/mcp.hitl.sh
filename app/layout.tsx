import { Geist, Geist_Mono } from 'next/font/google';

export const metadata = {
  title: "HITL MCP Server",
  description: "Minimal landing page for the HITL Model Context Protocol server",
};

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body
        style={{
          margin: 0,
          background: "linear-gradient(180deg, #f9fbff 0%, #f3f6fb 100%)",
          color: "#0b1220",
          minHeight: "100dvh",
          fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji',
        }}
      >
        {children}
      </body>
    </html>
  );
}
