"use client"

import type { ReactNode } from "react"
import { Inter } from "next/font/google"
import { useSession, signOut } from "next-auth/react"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"

const inter = Inter({ subsets: ["latin"] })

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()

  if (status === "loading") {
    return null // Or a loading spinner
  }

  if (!session) {
    redirect("/auth/login")
  }

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" })
  }

  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-gray-900 text-white`}>
        <div className="flex flex-col h-full">
          <header className="shrink-0 bg-gray-800 p-4 flex justify-between items-center">
            <span className="text-sm text-gray-400">
              Welcome, {session.user?.name || session.user?.email}
            </span>
            <Button 
              variant="ghost" 
              className="text-sm text-gray-400 hover:text-white"
              onClick={handleSignOut}
            >
              Sign out
            </Button>
          </header>
          <div className="flex-1 min-h-0">
            {children}
          </div>
        </div>
      </body>
    </html>
  )
}