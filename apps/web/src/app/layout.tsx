import type { Metadata } from "next";
import { Rubik, Outfit } from "next/font/google";
import { GeistMono } from 'geist/font/mono';
import { Navbar } from "@/components/ui/Navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";
import { Toaster } from "sonner";
import "./globals.css";

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-rubik",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "VeriSphere | Forensic Hiring Intelligence",
  description: "Cross-reference resume claims against GitHub evidence and certificate metadata to generate a structured candidate trust report.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${rubik.variable} ${GeistMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('verisphere-theme');
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                  document.documentElement.setAttribute('data-theme', 'light');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors duration-250 ease-in-out">
        <ThemeProvider>
          <AuthProvider>
            <Navbar />
            {children}
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
