import { continueConversation } from "../../actions"; // Importing from your actions file

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Call continueConversation to handle the conversation and tools
    const result = await continueConversation(messages);

    return new Response(JSON.stringify(result), {
      headers: {
        "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[ERROR] POST /api/chat", error);
    return new Response(
      JSON.stringify({ error: "An error occurred while processing your request." }),
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
