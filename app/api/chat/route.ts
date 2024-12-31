import { continueConversation } from "../../actions";

export async function POST(req: Request) {
  console.log("[POST /api/chat] Request received");
  const logs: string[] = [];
  const structuredLogs: any[] = []; // For logging detailed objects

  try {
    const body = await req.json();
    logs.push("[POST /api/chat] Parsed body:", JSON.stringify(body, null, 2));

    const { messages, record } = body;

    // Validate messages
    if (!messages || !Array.isArray(messages)) {
      logs.push("[POST /api/chat] Invalid input: messages is not an array.");
      return buildErrorResponse("Invalid input format.", logs, 400);
    }

    // Validate record
    if (!record || !record.type) {
      logs.push("[POST /api/chat] No valid record provided.");
      return buildErrorResponse("Record with valid type is required.", logs, 400);
    }

    structuredLogs.push({
      message: "[POST /api/chat] Processing record and messages",
      record,
      messages,
    });

    logs.push(
      `[POST /api/chat] Processing record and messages: Record - ${JSON.stringify(
        record
      )}, Messages - ${JSON.stringify(messages)}`
    );

    // Call continueConversation
    const result = await continueConversation([
      { role: "assistant", content: `Processing record: ${JSON.stringify(record)}` },
      ...messages,
    ]);

    // Log the result
    logs.push(
      "[POST /api/chat] Response from continueConversation:",
      JSON.stringify(result, null, 2)
    );
    structuredLogs.push({
      message: "[POST /api/chat] Response from continueConversation",
      result,
    });

    // Extract and log TOOL logs explicitly
    if (result.logs && Array.isArray(result.logs)) {
      logs.push(...result.logs);
      result.logs.forEach((log) => console.log("[TOOL]", log));
    }

    return new Response(
      JSON.stringify({
        ...flattenErrorResponse(result),
        logs: result.logs || logs,
        structuredLogs,
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
    console.error("[POST /api/chat] Error occurred:", error);

    logs.push(
      "[POST /api/chat] Error:",
      error instanceof Error ? error.message : JSON.stringify(error)
    );

    structuredLogs.push({
      message: "[POST /api/chat] Error occurred",
      error: error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error,
    });

    return buildErrorResponse(
      "An error occurred.",
      logs,
      500,
      structuredLogs,
      error instanceof Error ? error : undefined
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
