import { getServerSession } from "next-auth/next"
import { redirect } from "next/navigation"

export async function getSession() {
  const session = await getServerSession()
  return session
}

export async function requireAuth() {
  const session = await getSession()
  
  if (!session) {
    redirect("/auth/login")
  }
  
  return session
}
