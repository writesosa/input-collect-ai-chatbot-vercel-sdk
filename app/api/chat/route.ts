import { continueConversation } from "../../actions";
import { fetchAirtableData } from "../../utils/airtable";

export async function POST(req: Request) {
  try {
    const { messages, pageType, recordId, fields }: { 
      messages: any[];
      pageType: string;
      recordId: string;
      fields?: Record<string, any>;
    } = await req.json();

    console.log("[DEBUG] Incoming Payload:", { messages, pageType, recordId });

    let recordFields = fields;
    if (!fields && pageType && recordId) {
      recordFields = await fetchAirtableData(pageType, recordId);
      console.log("[DEBUG] Fetched Airtable Fields:", recordFields);
    }

    const { messages: updatedMessages } = await continueConversation(
      messages,
      pageType,
      recordId,
      recordFields
    );

    console.log("[DEBUG] Outgoing Messages:", updatedMessages);

    return new Response(JSON.stringify({ messages: updatedMessages }), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[ERROR] POST handler:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
