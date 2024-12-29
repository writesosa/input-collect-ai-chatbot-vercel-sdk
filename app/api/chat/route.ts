import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Handle POST requests
export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Stream text using OpenAI's GPT model
    const result = await streamText({
      model: openai("gpt-4-turbo"),
      messages,
    });

    // Create the AI stream response
    const aiStreamResponse = result.toAIStreamResponse();

    // Clone the response to modify headers
    const response = new Response(aiStreamResponse.body, aiStreamResponse);

    // Set CORS headers for the response
    response.headers.set("Access-Control-Allow-Origin", "https://www.wonderland.guru");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");

    return response;
  } catch (error) {
    console.error("Error in POST handler:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process the request." }),
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "https://www.wonderland.guru",
          "Content-Type": "application/json",
        },
      }
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
