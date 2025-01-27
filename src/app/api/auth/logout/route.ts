import { NextResponse } from "next/server"

export async function POST() {
  try {
    return NextResponse.json(
      { success: true },
      {
        status: 200,
        headers: {
          "Set-Cookie": `next-auth.session-token=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`,
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to logout" },
      { status: 500 }
    )
  }
}
