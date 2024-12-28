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
  console.log("[DEBUG] Airtable Update Request:", { url, updates });

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
      console.error("[ERROR] Airtable API Response:", errorText);
      throw new Error(`Airtable API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[DEBUG] Airtable API Update Response:", data);
    return data.fields;
  } catch (error) {
    console.error("[ERROR] Airtable Update Failed:", error);
    throw error;
  }
}
