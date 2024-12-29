import { openai } from "@ai-sdk/openai";
import { generateText } from "../../actions"; // Importing from the correct relative path

// Allow streaming responses up to 30 seconds
const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  try {
    // Use generateText from actions.ts
    const { text } = await generateText({
      model: openai("gpt-4-turbo"),
      messages,
    });

    // Create response
    const response = new Response(text, {
      headers: {
        "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });

    return response;
  } catch (error) {
    console.error("[ERROR] POST /api/chat", error);
    return new Response(
      "An error occurred while processing your request.",
      { status: 500 }
    );
  }
}

// Handle preflight OPTIONS request
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://www.wonderland.guru",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400", // Cache preflight response for 24 hours
    },
  });
}
