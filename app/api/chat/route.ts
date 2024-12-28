import { continueConversation } from "../../actions"; // Adjust the path as needed
import { Message } from "../../actions"; // Ensure Message is imported
import { updateAirtableRecord } from "../../utils/airtable"; // Helper function to update Airtable

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages, recordId, pageType, fields }: { 
      messages: Message[]; 
      recordId: string; 
      pageType: string; 
      fields: Record<string, any>; 
    } = await req.json();

    // Log incoming payload
    console.log("[INCOMING PAYLOAD]:", { messages, recordId, pageType, fields });

    // Generate the response using the assistant
    const { messages: updatedMessages } = await continueConversation([
      ...messages,
      { role: "system", content: `Here are the current record details: ${JSON.stringify(fields)}` },
    ]);

    // Extract assistant response for the user
    const userResponse = updatedMessages.find((msg) => msg.role === "assistant")?.content || "";

    // Extract Airtable updates from the assistant's response (assume JSON update format)
    const airtableUpdates = updatedMessages.find((msg) => msg.role === "assistant_update")?.content;
    let updateResult;

    if (airtableUpdates) {
      try {
        const parsedUpdates = JSON.parse(airtableUpdates);
        console.log("[Airtable Updates Parsed]:", parsedUpdates);

        // Update Airtable record
        updateResult = await updateAirtableRecord(pageType, recordId, parsedUpdates);
        console.log("[Airtable Update Result]:", updateResult);
      } catch (error) {
        console.error("[ERROR] Parsing or Updating Airtable:", error);
      }
    }

    // Log outgoing payload
    console.log("[OUTGOING PAYLOAD]:", { userResponse, airtableUpdates });

    return new Response(
      JSON.stringify({
        userResponse,
        airtableUpdates: updateResult,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
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
    },
  });
}
