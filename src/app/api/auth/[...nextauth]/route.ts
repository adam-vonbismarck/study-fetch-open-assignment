import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { AuthError } from "@/lib/auth"

const prisma = new PrismaClient()

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new AuthError("Invalid credentials", "INVALID_CREDENTIALS")
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) {
          throw new AuthError("No account found with this email address", "USER_NOT_FOUND")
        }

        const isValid = await bcrypt.compare(credentials.password, user.password)

        if (!isValid) {
          throw new AuthError("Incorrect password", "INVALID_PASSWORD")
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
    signOut: "/auth/logout",
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
