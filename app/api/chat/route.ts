import { continueConversation } from "../../actions";
import { Message } from "../../actions";
import { fetchAirtableData } from "../../utils/airtable";

export async function POST(req: Request) {
  try {
    const { messages, pageType, recordId, fields }: { 
      messages: Message[];
      pageType: string;
      recordId: string;
      fields?: Record<string, any>;
    } = await req.json();

    console.log("[DEBUG] Incoming Payload:", { messages, pageType, recordId, fields });

    // Fetch Airtable fields only on the first interaction or if fields are missing
    const initialFields =
      fields ?? (pageType && recordId ? await fetchAirtableData(pageType, recordId) : {});

    // Generate response
    const { messages: updatedMessages } = await continueConversation(
      messages,
      pageType,
      recordId,
      initialFields
    );

    console.log("[DEBUG] Outgoing Payload:", updatedMessages);

    // Stream the response
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
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("[ERROR] Processing Request:", error);

    return new Response("Internal Server Error", { status: 500 });
  }
}

// Handle preflight OPTIONS request
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400", // Cache preflight response for 24 hours
    },
  });
}
