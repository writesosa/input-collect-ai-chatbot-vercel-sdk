import { openai } from "@ai-sdk/openai";
import { Message } from "../../actions";

export async function POST(req: Request) {
  try {
    console.log('Received POST request:', req);

    const { airtableRecord, messages }: { airtableRecord: any, messages: any } = await req.json();
    console.log('Received Airtable record:', airtableRecord);
    console.log('Received messages:', messages);

    // Check if airtableRecord and messages exist
    if (airtableRecord && messages && messages.length > 0) {
      console.log('Processing Airtable record and user message...');
      const responseText = "Hello! How can I assist you today?";
      console.log('Sending response:', responseText);
      
      return new Response(responseText, {
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "https://www.wonderland.guru",
        },
      });
    } else {
      console.error('Missing or invalid airtableRecord or messages in the payload');
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
  console.log('Handling OPTIONS request');
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://www.wonderland.guru",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
