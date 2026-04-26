import { sendTestRequestEmail } from '../src/services/email';

async function run() {
  console.log("=========================================");
  console.log("Starting Gmail API Trial Run...");
  console.log("=========================================");
  try {
    const threadId = await sendTestRequestEmail("trial-test-123", "LOT-TRIAL-001", "Demo Lab");
    console.log("\n✅ SUCCESS! Trial email dispatched.");
    console.log("Thread ID:", threadId);
    console.log("\nPlease check your inbox! You should see an email sent from yourself, to yourself.");
  } catch (error) {
    console.error("\n❌ Trial run failed:", error);
  }
  process.exit(0);
}

run();
