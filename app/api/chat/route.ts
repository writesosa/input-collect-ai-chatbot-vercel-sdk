import { continueConversation } from "../../actions"; // Importing the actions file

export async function POST(req: Request) {
  try {
    console.log("[POST /api/chat] Received a request");

    // Parse the request body
    const { messages } = await req.json();
    console.log("[POST /api/chat] Parsed messages:", JSON.stringify(messages, null, 2));

    // Call continueConversation to process the conversation
    const result = await continueConversation(messages);
    console.log("[POST /api/chat] Result from continueConversation:", JSON.stringify(result, null, 2));

    // Check if the assistant provided a response
    const lastMessage = result.messages[result.messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant" || !lastMessage.content.trim()) {
      console.warn("[POST /api/chat] Assistant failed to provide a response.");
      return new Response(
        JSON.stringify({ error: "Assistant did not respond. Please try again." }),
        { status: 500 }
      );
    }

    // Return the result
    return new Response(JSON.stringify(result), {
      headers: {
        "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[POST /api/chat] An error occurred:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred while processing your request." }),
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  console.log("[OPTIONS /api/chat] Handling preflight request");
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://www.wonderland.guru",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400", // Cache preflight response for 24 hours
    },
  });
}
