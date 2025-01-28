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
      <header className="bg-gradient-to-r from-gray-800 to-gray-700 p-4 flex justify-between items-center fixed top-0 left-0 right-0 z-10 shadow-md">
        <span className="text-sm text-gray-400">
          Welcome, {session.user?.name || session.user?.email}
        </span>
        <h1 className="text-4xl font-bold text-white">AI Tutor</h1>
        <Button
          variant="ghost"
          className="text-sm text-gray-400 hover:text-bg-gray-800"
          onClick={handleSignOut}
        >
          Sign out
        </Button>
      </header>
      <main className="flex-grow pt-16">{children}</main>
    </div>
  )
}