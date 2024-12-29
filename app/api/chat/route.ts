// route.ts or similar file in your backend API handler
import { openai } from "@ai-sdk/openai";
import { Message } from "../../actions"; // Ensure the Message interface is imported

export async function POST(req: Request) {
  try {
    const { airtableRecord }: { airtableRecord: any } = await req.json();

    if (airtableRecord) {
      // Process the Airtable record and send a response
      const responseText = "Hello! How can I assist you today?";
      return new Response(responseText, {
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        },
      });
    } else {
      // Missing or invalid payload
      const responseText = "Hey, check your logs there's a problem";
      return new Response(responseText, {
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        },
      });
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// Handle preflight OPTIONS request
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
