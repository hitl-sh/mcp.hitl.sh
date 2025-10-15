export const metadata = {
  title: "HITL MCP Server",
  description: "Minimal landing page for the HITL Model Context Protocol server",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#060a18", color: "#e6e8f2" }}>{children}</body>
    </html>
  );
}
