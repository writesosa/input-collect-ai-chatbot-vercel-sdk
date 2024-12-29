async function fetchAirtableRecord(recordId: string) {
  console.log(`[LOG] Fetching Airtable record with ID: ${recordId}`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${recordId}`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  };

  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    console.error(`[ERROR] Failed to fetch record: ${response.statusText}`);
    throw new Error(`Error fetching record: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`[LOG] Successfully fetched Airtable record:`, data);
  return data;
}

async function updateAirtableRecord(recordId: string, fields: Record<string, any>) {
  console.log(`[LOG] Updating Airtable record with ID: ${recordId}, Fields:`, fields);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${recordId}`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) {
    console.error(`[ERROR] Failed to update record: ${response.statusText}`);
    throw new Error(`Error updating record: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`[LOG] Successfully updated Airtable record:`, data);
  return data;
}
