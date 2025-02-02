import { getServerSession } from "next-auth/next"
import { redirect } from "next/navigation"
import {authOptions} from "@/lib/auth-options";

export async function getSession() {
  const session = await getServerSession(authOptions)
  return session
}

export async function requireAuth() {
  const session = await getSession()
  
  if (!session) {
    redirect("/auth/login")
  }
  
  return session
}
