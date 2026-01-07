/**
 * Test script to verify putaway completion deduplication
 * Run this to test if duplicate lines are being created
 */

// Simulate the target_bin parsing logic
function parseTargetBin(targetBin) {
  let rack = null;
  let bin = null;
  
  if (targetBin) {
    const parts = targetBin.split('-');
    if (parts.length >= 2) {
      // Last part is the bin, everything before is the rack
      bin = parts[parts.length - 1];
      rack = parts.slice(0, parts.length - 1).join('-');
    } else if (parts.length === 1) {
      // Only one part - treat as rack, bin is empty
      rack = parts[0];
      bin = '';
    }
  }
  
  return { rack, bin };
}

// Test cases
const testCases = [
  { target_bin: "A1-R01-L1-B1-B1", expected: { rack: "A1-R01-L1-B1", bin: "B1" } },
  { target_bin: "A1-R01-L1-B1", expected: { rack: "A1-R01-L1", bin: "B1" } },
  { target_bin: "A1-R01", expected: { rack: "A1", bin: "R01" } },
  { target_bin: "RACK-A", expected: { rack: "RACK", bin: "A" } },
];

console.log("=== Testing target_bin Parsing ===\n");

testCases.forEach((test, index) => {
  const result = parseTargetBin(test.target_bin);
  const passed = result.rack === test.expected.rack && result.bin === test.expected.bin;
  
  console.log(`Test ${index + 1}: ${test.target_bin}`);
  console.log(`  Expected: rack="${test.expected.rack}", bin="${test.expected.bin}"`);
  console.log(`  Got:      rack="${result.rack}", bin="${result.bin}"`);
  console.log(`  ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
});

// Test deduplication key generation
console.log("=== Testing Deduplication Key Generation ===\n");

const item1 = {
  item_code: "SKU-HAT-301-BLU-OS",
  carton_id: "PAW-ASN12225-1767129206",
  target_bin: "A1-R01-L1-B1-B1"
};

const item2 = {
  item_code: "SKU-HAT-301-BLU-OS",
  carton_id: "PAW-ASN12225-1767129206",
  target_bin: "A1-R01-L1-B1-B1"  // Same as item1
};

const parse1 = parseTargetBin(item1.target_bin);
const parse2 = parseTargetBin(item2.target_bin);

const key1 = `${item1.item_code}|${parse1.rack || ''}|${parse1.bin || ''}|${item1.carton_id || ''}`;
const key2 = `${item2.item_code}|${parse2.rack || ''}|${parse2.bin || ''}|${item2.carton_id || ''}`;

console.log(`Item 1 key: ${key1}`);
console.log(`Item 2 key: ${key2}`);
console.log(`Keys match: ${key1 === key2 ? '✅ YES (will be deduplicated)' : '❌ NO (will create duplicate)'}\n`);

// Test with different carton_ids
const item3 = {
  item_code: "SKU-HAT-301-BLU-OS",
  carton_id: "PAW-ASN12225-1767130842524",  // Different carton
  target_bin: "A1-R01-L1-B1-B1"
};

const parse3 = parseTargetBin(item3.target_bin);
const key3 = `${item3.item_code}|${parse3.rack || ''}|${parse3.bin || ''}|${item3.carton_id || ''}`;

console.log(`Item 3 (different carton) key: ${key3}`);
console.log(`Item 1 vs Item 3: ${key1 === key3 ? '❌ SAME (should be different!)' : '✅ DIFFERENT (correct - different cartons)'}\n`);

