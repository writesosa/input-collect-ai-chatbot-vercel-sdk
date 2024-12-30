import { continueConversation } from "../../actions";

export async function POST(req: Request) {
  console.log("[POST /api/chat] Request received");

  try {
    const body = await req.json();
    console.log("[POST /api/chat] Parsed body:", JSON.stringify(body, null, 2));

    const { messages, recordId } = body;

    if (!messages || !Array.isArray(messages)) {
      console.error("[POST /api/chat] Invalid input: messages is not an array.");
      return new Response(JSON.stringify({ error: "Invalid input format." }), {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (recordId) {
      // Fetch single account
      console.log("[POST /api/chat] Fetching single account with recordId:", recordId);
      const account = await getSingleAccount(recordId);

      if (!account) {
        console.error("[POST /api/chat] Account not found.");
        return new Response(
          JSON.stringify({ error: "Account not found." }),
          {
            status: 404,
            headers: {
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      const accountSummary = {
        recordId: account.id,
        accountName: account.fields["Name"],
        clientFile: account.fields["Client File"],
      };

      const result = await continueConversation([
        {
          role: "assistant",
          content: `Here is the account: ${JSON.stringify(accountSummary)}`,
        },
        ...messages,
      ]);

      console.log("[POST /api/chat] Response for single account:", JSON.stringify(result, null, 2));

      return new Response(JSON.stringify(result), {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      });
    } else {
      // Fetch all accounts
      console.log("[POST /api/chat] Fetching all accounts...");
      const accounts = await getAllAccounts();

      if (!accounts.length) {
        console.error("[POST /api/chat] No accounts found.");
        return new Response(
          JSON.stringify({ error: "No accounts found." }),
          {
            status: 404,
            headers: {
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      const accountsSummary = accounts.map((account) => ({
        recordId: account.id,
        accountName: account.fields["Name"],
        clientFile: account.fields["Client File"],
      }));

      const result = await continueConversation([
        {
          role: "assistant",
          content: `Here are all accounts: ${JSON.stringify(accountsSummary)}`,
        },
        ...messages,
      ]);

      console.log("[POST /api/chat] Response for all accounts:", JSON.stringify(result, null, 2));

      return new Response(JSON.stringify(result), {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      });
    }
  } catch (error) {
    console.error("[POST /api/chat] Error:", error);
    return new Response(JSON.stringify({ error: "An error occurred." }), {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

async function getAllAccounts() {
  try {
    const response = await fetch("https://api.airtable.com/v0/your_base_id/Accounts", {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch all accounts");
    }

    return (await response.json()).records;
  } catch (error) {
    console.error("[getAllAccounts] Error:", error);
    return [];
  }
}

async function getSingleAccount(recordId: string) {
  try {
    const response = await fetch(`https://api.airtable.com/v0/your_base_id/Accounts/${recordId}`, {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      },
    });

    if (!response.ok) {
      console.error(`[getSingleAccount] Failed to fetch account for recordId: ${recordId}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[getSingleAccount] Error:", error);
    return null;
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
