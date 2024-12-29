import { openai } from "@ai-sdk/openai";
import { continueConversation } from "../../actions"; // Adjust the import path as necessary
import { Message } from "../../actions"; // Ensure the Message interface is imported

export async function POST(req: Request) {
  try {
    const { messages, recordId }: { messages: Message[]; recordId: string | null } = await req.json();
    console.log(`[LOG] Received POST request with messages:`, messages, `Record ID:`, recordId);

    const { messages: updatedMessages } = await continueConversation(messages, recordId);
    console.log(`[LOG] Successfully processed conversation. Updated messages:`, updatedMessages);

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

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error(`[ERROR] Processing POST request failed:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://www.wonderland.guru",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
