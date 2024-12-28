import { continueConversation } from "../../actions"; // Adjust the import path as necessary
import { Message } from "../../actions"; // Ensure the Message interface is imported

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    // Log the incoming request payload
    const { messages }: { messages: Message[] } = await req.json();
    console.log("[INCOMING PAYLOAD] Messages:", messages);

    // Generate the response using continueConversation
    const { messages: updatedMessages } = await continueConversation(messages);

    // Log the outgoing response payload
    console.log("[OUTGOING PAYLOAD] Updated Messages:", updatedMessages);

    // Stream the assistant's response back to the client
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        updatedMessages.forEach((msg) => {
          if (msg.role === "assistant") {
            controller.enqueue(encoder.encode(msg.content));
          }
        });
        controller.close();
      },
    });

    // Create the response with the stream
    const response = new Response(stream, {
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });

    return response;
  } catch (error) {
    console.error("[ERROR] Processing request:", error);
    return new Response("Internal Server Error", { status: 500 });
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
