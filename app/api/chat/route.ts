import { continueConversation } from "../../actions";

export async function POST(req: Request) {
  console.log("[POST /api/chat] Request received");

  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      console.error("[POST /api/chat] Invalid input format");
      return new Response(JSON.stringify({ error: "Invalid input format." }), { status: 400 });
    }

    console.log("[POST /api/chat] Received messages:", JSON.stringify(messages, null, 2));

    const result = await continueConversation(messages);
    console.log("[POST /api/chat] Response:", JSON.stringify(result, null, 2));

    const lastMessage = result.messages[result.messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant" || !lastMessage.content.trim()) {
      console.warn("[POST /api/chat] Assistant did not respond.");
      return new Response(JSON.stringify({ error: "Assistant did not respond." }), { status: 500 });
    }

    return new Response(JSON.stringify(result), {
      headers: {
        "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[POST /api/chat] Error:", error);
    return new Response(JSON.stringify({ error: "An error occurred." }), { status: 500 });
  }
}
