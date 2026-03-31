import "@/styles/globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata = {
  title: { default: "Animedex — Watch Anime Free", template: "%s | Animedex" },
  description: "Watch anime online in HD. Sub & Dub available. No account required.",
  keywords: ["anime", "watch anime", "animedex", "anime streaming", "free anime"],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#07080d" />
      </head>
      <body>
        <AuthProvider>
          <Navbar />
          <main style={{ minHeight: "100vh", paddingTop: "var(--nav-h)" }}>
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
