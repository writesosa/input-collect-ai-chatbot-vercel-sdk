import { continueConversation } from "../../actions"; // Adjust the import path as needed
import { Message } from "../../actions"; // Ensure Message is imported
import { fetchAirtableData } from "../../utils/airtable"; // Ensure this function exists to fetch Airtable data

export async function POST(req: Request) {
  try {
    // Parse the incoming request payload
    const { messages, pageType, recordId, fields }: { 
      messages: Message[];
      pageType: string;
      recordId: string;
      fields: Record<string, any>;
    } = await req.json();

    console.log("[DEBUG] Incoming Payload:", { messages, pageType, recordId, fields });

    // Fetch Airtable data if fields are not provided
    let recordFields = fields;
    if (!recordFields && pageType && recordId) {
      recordFields = await fetchAirtableData(pageType, recordId);
    }

    // Generate the response using the assistant
    const { messages: updatedMessages } = await continueConversation(
      messages,
      pageType,
      recordId,
      recordFields
    );

    console.log("[DEBUG] Outgoing Payload:", updatedMessages);

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
