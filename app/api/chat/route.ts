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

    // Fetch Airtable data if fields are not provided
    const recordFields = fields || await fetchAirtableData(pageType, recordId);

    const { messages: updatedMessages } = await continueConversation(
      messages,
      pageType,
      recordId,
      recordFields
    );

    console.log("[DEBUG] Outgoing Payload:", updatedMessages);

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
