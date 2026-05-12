import "./globals.css";

export const metadata = {
  title: "Sutherland Vision Hub",
  description: "Enterprise AI Vision Website prototype",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
