import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as z from 'zod'

const prisma = new PrismaClient()

// Custom error class for authentication errors
export class AuthError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'AuthError'
  }
}

// Validation schemas
export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

// TODO reimplment this
export const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters')
    .max(50, 'Name cannot be longer than 50 characters')
    .regex(/^[a-zA-Z\s-']+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes'),
  email: z.string().email('Please enter a valid email address')
    .max(100, 'Email cannot be longer than 100 characters'),
  password: z.string()
  //   .min(6, 'Password must be at least 6 characters')
  //   .max(72, 'Password cannot be longer than 72 characters')
  //   .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number'),
})

export async function createUser(data: z.infer<typeof signupSchema>) {
  const { email, password, name } = data

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  })

  if (existingUser) {
    throw new AuthError(
      'This email is already registered. Please use a different email or try logging in.',
      'EMAIL_EXISTS'
    )
  }

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
    })

    // Don't return the password
    const { password: _, ...userWithoutPassword } = user
    return userWithoutPassword
  } catch (error) {
    throw new AuthError(
      'Failed to create account. Please try again later.',
      'CREATE_FAILED'
    )
  }
}

export async function verifyUser(data: z.infer<typeof loginSchema>) {
  const { email, password } = data

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  })

  if (!user) {
    throw new AuthError(
      'No account found with this email address.',
      'USER_NOT_FOUND'
    )
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.password)

  if (!isValid) {
    throw new AuthError(
      'Incorrect password. Please try again.',
      'INVALID_PASSWORD'
    )
  }

  // Don't return the password
  const { password: _, ...userWithoutPassword } = user
  return userWithoutPassword
}
