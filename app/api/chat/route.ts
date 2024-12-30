import { continueConversation } from "../../actions";

export async function POST(req: Request) {
  console.log("[POST /api/chat] Request received");

  try {
    const body = await req.json();
    console.log("[POST /api/chat] Parsed body:", JSON.stringify(body, null, 2));

    const { messages, record } = body;

    if (!messages || !Array.isArray(messages)) {
      console.error("[POST /api/chat] Invalid input: messages is not an array.");
      return new Response(JSON.stringify({ error: "Invalid input format." }), {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    console.log("[POST /api/chat] Processing messages:", messages);

    let initialMessage = null;

    if (record && record.id) {
      console.log("[POST /api/chat] Record provided:", JSON.stringify(record, null, 2));
      initialMessage = { role: "assistant", content: `Here's your account: ${JSON.stringify(record)}` };
    } else {
      console.log("[POST /api/chat] No specific record provided, proceeding with normal conversation.");
    }

    const result = await continueConversation(initialMessage ? [initialMessage, ...messages] : messages);

    console.log("[POST /api/chat] Response from continueConversation:", JSON.stringify(result, null, 2));

    return new Response(JSON.stringify(result), {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[POST /api/chat] Error:", error);
    return new Response(JSON.stringify({ error: "An error occurred." }), {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
