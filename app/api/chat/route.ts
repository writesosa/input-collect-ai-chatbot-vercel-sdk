import { continueConversation } from "../../actions";

export async function POST(req: Request) {
  console.log("[POST /api/chat] Request received");
  const logs: string[] = [];
  const structuredLogs: any[] = []; // For logging detailed objects

  try {
    const body = await req.json();
    logs.push("[POST /api/chat] Parsed body:", JSON.stringify(body, null, 2));

    const { messages, record } = body;

    if (!messages || !Array.isArray(messages)) {
      logs.push("[POST /api/chat] Invalid input: messages is not an array.");
      return new Response(JSON.stringify({ error: "Invalid input format.", logs }), {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (!record || !record.type) {
      logs.push("[POST /api/chat] No valid record provided.");
      return new Response(
        JSON.stringify({ error: "Record with valid type is required.", logs }),
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Handle both string and structured logs
    structuredLogs.push({
      message: "[POST /api/chat] Processing record and messages",
      record,
      messages,
    });

    logs.push(`[POST /api/chat] Processing record and messages: Record - ${JSON.stringify(record)}, Messages - ${JSON.stringify(messages)}`);

    const result = await continueConversation([
      { role: "assistant", content: `Processing record: ${JSON.stringify(record)}` },
      ...messages,
    ]);

    logs.push("[POST /api/chat] Response from continueConversation:", JSON.stringify(result, null, 2));
    structuredLogs.push({
      message: "[POST /api/chat] Response from continueConversation",
      result,
    });

    return new Response(
      JSON.stringify({
        ...flattenErrorResponse(result),
        logs: result.logs || logs, // Include logs in the response
        structuredLogs, // Optionally include structured logs
      }),
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    logs.push("[POST /api/chat] Error:", error instanceof Error ? error.message : JSON.stringify(error));
    structuredLogs.push({
      message: "[POST /api/chat] Error occurred",
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });

    // Push detailed error to the frontend
    return new Response(
      JSON.stringify(flattenErrorResponse({
        error: "An error occurred.",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        raw: error,
        logs,
        structuredLogs,
      })),
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
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
