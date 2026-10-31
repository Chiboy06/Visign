import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

// Display: characterful grotesque. Body: Braille Institute's typeface built for low-vision legibility.
const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const body = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Visign: speak and sign, both understood",
  description: "A live two-way bridge between sign language (NSL and ASL) and speech, in any browser.",
};

export const viewport: Viewport = { themeColor: "#16215C" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
