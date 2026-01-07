// Test API dispatch endpoint directly
import fetch from "node-fetch";

const API_URL = process.env.API_URL || "http://localhost:3000";

async function testAPIDispatch() {
  console.log("Testing API Dispatch Endpoint...\n");

  // First, find a sealed Transfer Carton
  try {
    const listResponse = await fetch(`${API_URL}/api/transfer-cartons`);
    const listData = await listResponse.json();

    if (!listData.ok || !listData.data || listData.data.length === 0) {
      console.log("❌ No transfer cartons found");
      return;
    }

    // Find a sealed but not dispatched Transfer Carton
    const sealedTC = listData.data.find(
      (tc) => tc.status === "Sealed" && !tc.dispatched_on
    );

    if (!sealedTC) {
      console.log("❌ No sealed (undispatched) Transfer Carton found");
      console.log("\nAvailable Transfer Cartons:");
      listData.data.slice(0, 5).forEach((tc) => {
        console.log(
          `  ${tc.tc_id}: Status=${tc.status}, Dispatched=${tc.dispatched_on ? "Yes" : "No"}`
        );
      });
      return;
    }

    console.log(`✅ Found sealed Transfer Carton: ${sealedTC.tc_id}`);
    console.log(`   Material Request: ${sealedTC.to_no || sealedTC.transfer_order}`);

    // Get carton contents before dispatch
    console.log("\n📦 Getting carton contents before dispatch...");
    const contentsResponse = await fetch(
      `${API_URL}/api/transfer-cartons/${sealedTC.tc_id}`
    );
    const contentsData = await contentsResponse.json();

    if (contentsData.ok && contentsData.data && contentsData.data.contents) {
      console.log(`   Found ${contentsData.data.contents.length} item(s):`);
      contentsData.data.contents.forEach((item) => {
        console.log(`     ${item.item_code}: ${item.qty}`);
      });
    }

    // Dispatch the Transfer Carton
    console.log(`\n🚀 Dispatching Transfer Carton ${sealedTC.tc_id}...`);
    const dispatchResponse = await fetch(
      `${API_URL}/api/transfer-cartons/dispatch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tc_id: sealedTC.tc_id,
          dispatched_by: "API_TEST_USER",
        }),
      }
    );

    const dispatchData = await dispatchResponse.json();

    if (!dispatchResponse.ok) {
      console.log(`❌ Dispatch failed: ${dispatchResponse.status}`);
      console.log(JSON.stringify(dispatchData, null, 2));
      return;
    }

    if (dispatchData.ok) {
      console.log("✅ Dispatch API call successful!");
      console.log(`   Message: ${dispatchData.message}`);
    } else {
      console.log(`❌ Dispatch failed:`);
      console.log(JSON.stringify(dispatchData, null, 2));
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.code === "ECONNREFUSED") {
      console.error("   Cannot connect to API server. Is it running?");
      console.error(`   Expected URL: ${API_URL}`);
    }
  }
}

testAPIDispatch();

