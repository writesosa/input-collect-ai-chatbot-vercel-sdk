import { continueConversation } from "./actions";

// Common CORS Headers
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://www.wonderland.guru",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function POST(req: Request) {
  try {
    // Parse the request body
    const { messages } = await req.json();
    const response = await continueConversation(messages);

    // Return the response with CORS headers
    return new Response(JSON.stringify(response), {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error in POST handler:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process the request." }),
      {
        status: 500,
        headers: CORS_HEADERS,
      }
    );
  }
}

export async function OPTIONS() {
  // Return preflight response with CORS headers
  return new Response(null, {
    headers: {
      ...CORS_HEADERS,
      "Access-Control-Max-Age": "86400", // Cache preflight response for 24 hours
    },
  });
}
