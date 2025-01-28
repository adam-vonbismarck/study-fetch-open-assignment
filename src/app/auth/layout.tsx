import type { ReactNode } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <h1 className="text-4xl font-bold text-white hover:text-gray-300 transition-colors">AI Tutor</h1>
          </Link>
          <p className="text-gray-400 mt-2">Your personal AI-powered learning assistant</p>
        </div>
        {children}
        <div className="mt-8 text-center">
          <Button asChild variant="link" className="text-gray-400 hover:text-white">
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}