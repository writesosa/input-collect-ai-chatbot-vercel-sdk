import axios from "axios";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

export async function updateAirtableRecord(tableName: string, recordId: string, updates: Record<string, any>) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${tableName}/${recordId}`;

  try {
    const response = await axios.patch(
      url,
      { fields: updates },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("[ERROR] Updating Airtable Record:", error);
    throw error;
  }
}
