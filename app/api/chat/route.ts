import { continueConversation } from "../../actions";

export async function POST(req: Request) {
  console.log("[POST /api/chat] Request received");

  try {
    const body = await req.json();
    console.log("[POST /api/chat] Parsed body:", body);

    const { messages, record } = body;

    if (!messages || !Array.isArray(messages)) {
      console.error("[POST /api/chat] Invalid input: messages is not an array.");
      return new Response(
        JSON.stringify({ error: "Invalid input format." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!record || !record.type) {
      console.error("[POST /api/chat] No valid record provided.");
      return new Response(
        JSON.stringify({ error: "Record with valid type is required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await continueConversation([
      { role: "assistant", content: `Processing record: ${JSON.stringify(record)}` },
      ...messages,
    ]);

    console.log("[POST /api/chat] Response from continueConversation:", result);

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("[POST /api/chat] Error occurred:", error);

    return new Response(
      JSON.stringify({ 
        error: "An error occurred.", 
        details: errorMessage, 
        stack: errorStack 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
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


function flattenErrorResponse(response: any): Record<string, any> {
  if (typeof response === "object" && response !== null) {
    return Object.entries(response).reduce((acc: Record<string, any>, [key, value]) => {
      if (typeof value === "object" && value !== null) {
        const flattened = flattenErrorResponse(value);
        Object.entries(flattened).forEach(([nestedKey, nestedValue]) => {
          acc[`${key}.${nestedKey}`] = nestedValue;
        });
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
  }
  return response;
}

function buildErrorResponse(
  message: string,
  logs: string[],
  status: number,
  structuredLogs?: any[],
  error?: Error
) {
  if (error) {
    logs.push("[POST /api/chat] Error:", error.message);
    console.error("[POST /api/chat] Error occurred:", error);
  }

  return new Response(
    JSON.stringify(
      flattenErrorResponse({
        error: message,
        details: error?.message || "Unknown error",
        stack: error?.stack,
        logs,
        structuredLogs,
      })
    ),
    {
      status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    }
  );
}
