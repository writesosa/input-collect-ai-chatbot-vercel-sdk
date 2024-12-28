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
    console.error("Unknown page type. Cannot fetch data.");
    return null;
  }

  const url = `https://api.airtable.com/v0/${baseId}/${tableName}/${recordId}`;
  console.log(`Fetching from Airtable URL: ${url}`); // Log the request URL

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error Response from Airtable:", errorText);
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("[DEBUG] Fetched Airtable Data:", data.fields);
    return data.fields;
  } catch (error) {
    console.error("Error fetching Airtable data:", error);
    throw error;
  }
}
