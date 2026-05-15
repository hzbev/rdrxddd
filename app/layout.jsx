import "./globals.css";

export const metadata = {
  title: "CS2 WebRTC Radar",
  description: "Minimal CS2-style radar renderer with WebRTC peer-to-peer data flow"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
