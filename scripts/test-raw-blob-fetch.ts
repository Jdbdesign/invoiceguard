const BLOB_URL =
  "https://a0jrpgiul3lhfui4.public.blob.vercel-storage.com/Remitrak_Test_Statement-pDIhmzR0fNk0jJgOUTn0NtH5rf72bk.pdf";

async function attempt(i: number) {
  try {
    const res = await fetch(BLOB_URL);
    const buf = await res.arrayBuffer();
    console.log(`  [${i}] status=${res.status} bytes=${buf.byteLength}`);
  } catch (err) {
    console.log(`  [${i}] FETCH THREW: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  console.log("Round 1: 20 concurrent raw fetches directly to the blob URL...");
  await Promise.all(Array.from({ length: 20 }, (_, i) => attempt(i + 1)));

  console.log("\nRound 2: 20 MORE concurrent raw fetches immediately after...");
  await Promise.all(Array.from({ length: 20 }, (_, i) => attempt(i + 1)));
}

main();
