// airtable.ts

export async function updateAirtableRecord(
  tableName: string,
  recordId: string,
  updates: Record<string, any>
) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    throw new Error("Airtable API key or Base ID is missing. Check environment variables.");
  }

  const url = `https://api.airtable.com/v0/${baseId}/${tableName}/${recordId}`;

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: updates }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Airtable Error] Update failed:", errorText);
      throw new Error(`Airtable API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[DEBUG] Airtable Update Successful:", data.fields);
    return data.fields;
  } catch (error) {
    console.error("[ERROR] Updating Airtable Record:", error);
    throw error;
  }
}

export async function fetchAirtableData(pageType: string, recordId: string) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    throw new Error("Airtable API key or Base ID is missing. Check environment variables.");
  }

  let tableName;

  if (pageType === "accounts") {
    tableName = "Accounts";
  } else if (pageType === "journey") {
    tableName = "Journeys";
  } else {
    console.error("[Airtable Error] Unknown page type:", pageType);
    return null;
  }

  const url = `https://api.airtable.com/v0/${baseId}/${tableName}/${recordId}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Airtable Error] Fetch failed:", errorText);
      throw new Error(`Failed to fetch Airtable data: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[DEBUG] Airtable Fetched Data:", data.fields);
    return data.fields;
  } catch (error) {
    console.error("[ERROR] Fetching Airtable Data:", error);
    throw error;
  }
}
