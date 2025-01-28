import type {ReactNode} from "react"
import "./globals.css"
import {Providers} from "./providers"
import {Inter} from "next/font/google";

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: 'AI Tutor',
  description: 'Your personal AI-powered learning assistant',
}

export default function RootLayout({children}: { children: ReactNode }) {
  return (
    <html lang="en">
    <body className={`${inter.className} bg-gray-900 text-white`}>
    <Providers>
      <div className="min-h-screen flex flex-col">{children}</div>
    </Providers>
    </body>
    </html>
  )
}
