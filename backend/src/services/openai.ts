import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY || 'dummy_key';

const openai = new OpenAI({
  apiKey: apiKey,
});

export async function analyzeLabReport(emailBody: string, attachmentText: string) {
  try {
    const prompt = `
    You are an AI assistant tasked with extracting structured data from lab test reports.
    Please read the following email body and the extracted text from its attached PDF report.
    Identify the "Lot Number" or "Lot No." associated with this report.
    Also, summarize the test results.

    Email Body:
    ${emailBody.substring(0, 1000)}

    Attachment Text:
    ${attachmentText.substring(0, 4000)}

    Respond strictly in JSON format with the following structure:
    {
      "lotNumber": "extracted lot number or null if not found",
      "results": {
        "summary": "brief summary of the test results",
        "isValid": boolean (true if the test passed, false if failed, or null if unknown)
      }
    }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content received from OpenAI");

    return JSON.parse(content);
  } catch (error) {
    console.error("[OPENAI] Error analyzing lab report:", error);
    throw error;
  }
}
