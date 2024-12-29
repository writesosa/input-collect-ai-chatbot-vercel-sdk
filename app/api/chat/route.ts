import { openai } from "@ai-sdk/openai";

export async function POST(req) {
  const { messages } = await req.json();

  try {
    const result = await openai.createChatCompletion({
      model: "gpt-4-turbo",
      messages,
    });

    // Respond with the full conversation history
    return new Response(
      JSON.stringify({
        messages: [...messages, { role: "assistant", content: result.choices[0].message.content }],
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (error) {
    console.error("[Backend] Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

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
