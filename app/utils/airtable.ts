import fetch from "node-fetch";

const apiKey = "your_airtable_api_key";
const baseId = "your_airtable_base_id";

export async function updateAirtableRecord(tableName: string, recordId: string, updates: Record<string, any>) {
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
      throw new Error(`Airtable API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[DEBUG] Airtable Update Response:", data);
    return data.fields;
  } catch (error) {
    console.error("[ERROR] Updating Airtable Record:", error);
    throw error;
  }
}
