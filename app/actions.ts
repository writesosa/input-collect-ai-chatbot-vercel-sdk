export async function continueConversation(
  history: Message[],
  pageType: string,
  recordId: string,
  fields: Record<string, any>
) {
  "use server";

  try {
    const lastMessage = history[history.length - 1];

    // Detect if a tool is required
    const requiresTool =
      /(update|change|modify)/i.test(lastMessage.content) &&
      /(name|field|account)/i.test(lastMessage.content);

    console.log("[DEBUG] Tool Required:", requiresTool);

    const systemPrompt = `
      You are an assistant for managing Airtable records. Use the following actions:
      - modifyRecord: Modify any field dynamically.

      Current record details:
      ${JSON.stringify(fields)}

      If a user requests to modify a field, confirm their intent first. If confirmed, use modifyRecord to update the record.
    `;

    const { text, toolResults } = await generateText({
      model: openai("gpt-4"),
      system: systemPrompt,
      messages: history,
      maxToolRoundtrips: requiresTool ? 5 : 0, // Only invoke tools if needed
      tools: requiresTool ? { modifyRecord } : undefined,
    });

    console.log("[DEBUG] Assistant Response Text:", text);
    console.log("[DEBUG] Tool Results:", toolResults);

    const assistantMessages = [
      ...history,
      {
        role: "assistant" as const,
        content: text || toolResults.map((toolResult) => toolResult.result).join("\n"),
      },
    ];

    return {
      messages: assistantMessages,
    };
  } catch (error) {
    console.error("[ERROR] Processing Conversation:", error);

    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content: "An error occurred while processing your request. Please try again.",
        },
      ],
    };
  }
}
