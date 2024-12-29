import { continueConversation } from "./actions";
import { openai } from "@ai-sdk/openai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Call continueConversation from actions.ts
    const response = await continueConversation(messages);

    // Format the response for streaming
    const aiStreamResponse = new Response(JSON.stringify(response.messages), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });

    return aiStreamResponse;
  } catch (error) {
    console.error("[Error in POST handler]:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process the request." }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://www.wonderland.guru",
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
