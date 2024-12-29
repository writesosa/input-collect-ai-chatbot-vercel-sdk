import { continueConversation } from "../../actions";

export async function POST(req: Request) {
  console.log("[POST /api/chat] Request received");

  try {
    const body = await req.json();
    console.log("[POST /api/chat] Parsed body:", JSON.stringify(body, null, 2));

    const { record, messages } = body;
    if (!messages || !Array.isArray(messages)) {
      console.error("[POST /api/chat] Invalid input: messages is not an array.");
      return new Response(JSON.stringify({ error: "Invalid input format." }), {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        },
      });
    }

    console.log("[POST /api/chat] Processing messages and record.");
    console.log("[POST /api/chat] Record:", JSON.stringify(record, null, 2));

    // Add the record details as a system message for initial context
    if (record && messages.length === 1 && messages[0]?.role === "user") {
      const systemMessage = {
        role: "system",
        content: `Record information: ${JSON.stringify(record)}.`,
      };
      messages.unshift(systemMessage);
    }

    const result = await continueConversation(messages);

    console.log("[POST /api/chat] Response from continueConversation:", JSON.stringify(result, null, 2));

    const lastMessage = result.messages[result.messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant" || !lastMessage.content.trim()) {
      console.warn("[POST /api/chat] Assistant did not provide a response.");
      return new Response(JSON.stringify({ error: "Assistant did not respond. Please try again." }), {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: {
        "Access-Control-Allow-Origin": "https://www.wonderland.guru",
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
        "Access-Control-Allow-Origin": "https://www.wonderland.guru",
      },
    });
  }
}

export async function OPTIONS() {
  console.log("[OPTIONS /api/chat] Preflight request handled");

  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://www.wonderland.guru",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
