import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {authOptions} from "@/lib/auth-options";

export default async function HomePage() {
  const session = await getServerSession(authOptions)

  if (session) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Welcome to AI Tutor</h1>
        <p className="text-xl text-gray-400">Your personal AI-powered learning assistant</p>
      </div>
      <div className="space-x-4">
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href="/auth/login">Log in</Link>
        </Button>
        <Button asChild className="bg-green-600 hover:bg-green-700">
          <Link href="/auth/signup">Sign up</Link>
        </Button>
      </div>
    </div>
  )
}
