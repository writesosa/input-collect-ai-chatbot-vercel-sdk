export async function POST(req: Request) {
  try {
    const { messages, pageType, recordId, fields }: { 
      messages: Message[];
      pageType: string;
      recordId: string;
      fields?: Record<string, any>;
    } = await req.json();

    console.log("[DEBUG] Incoming Payload:", { messages, pageType, recordId, fields });

    const initialFields =
      fields ?? (pageType && recordId ? await fetchAirtableData(pageType, recordId) : {});

    console.log("[DEBUG] Fetched Initial Fields:", initialFields);

    const { messages: updatedMessages } = await continueConversation(
      messages,
      pageType,
      recordId,
      initialFields
    );

    console.log("[DEBUG] Outgoing Payload (Messages):", updatedMessages);

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
