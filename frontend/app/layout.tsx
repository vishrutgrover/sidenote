import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SearchProvider } from "@/components/SearchProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sidenote",
  description: "Meeting notes, transcripts and answers",
};

// Runs before the page paints, so a dark-mode user never sees a white flash.
const setTheme = `(function(){try{var t=localStorage.getItem("theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: setTheme }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <SearchProvider>{children}</SearchProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
