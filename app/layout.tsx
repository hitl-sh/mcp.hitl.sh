export const metadata = {
  title: "HITL MCP Server",
  description: "Minimal landing page for the HITL Model Context Protocol server",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "linear-gradient(180deg, #f9fbff 0%, #f3f6fb 100%)", color: "#0b1220", minHeight: "100dvh" }}>{children}</body>
    </html>
  );
}
