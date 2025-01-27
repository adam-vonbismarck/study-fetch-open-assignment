import { NextResponse } from 'next/server'
import { createUser, signupSchema, AuthError } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate input
    try {
      const validatedData = signupSchema.parse(body)
      const user = await createUser(validatedData)
      return NextResponse.json(user, { status: 201 })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        // Format Zod validation errors
        const errors = error.errors.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message
        }))
        return NextResponse.json(
          { 
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors
          },
          { status: 400 }
        )
      }
      throw error // Pass other errors to main error handler
    }
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { 
          error: error.message,
          code: error.code
        },
        { status: 400 }
      )
    }
    
    // Unexpected errors
    console.error('Signup error:', error)
    return NextResponse.json(
      { 
        error: 'An unexpected error occurred. Please try again later.',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    )
  }
}
