"use client"

import type { ReactNode } from "react"
import { Inter } from "next/font/google"
import { useSession, signOut } from "next-auth/react"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import {getServerSession} from "next-auth";

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
    <div className="min-h-screen flex flex-col">
      <header className=" bg-gray-800 p-4 flex justify-between items-center">
        <span className="text-sm text-gray-400">
          Welcome, {session.user?.name || session.user?.email}
        </span>
        <Button
          variant="ghost"
          className="text-sm text-gray-400 hover:text-bg-gray-800"
          onClick={handleSignOut}
        >
          Sign out
        </Button>
      </header>
      <main className="flex-grow">{children}</main>
    </div>
  )
}