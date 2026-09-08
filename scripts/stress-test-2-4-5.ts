import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

const BASE = "http://localhost:3312";
const BLOB_URL =
  "https://a0jrpgiul3lhfui4.public.blob.vercel-storage.com/Remitrak_Test_Statement-pDIhmzR0fNk0jJgOUTn0NtH5rf72bk.pdf";

function parseCookies(setCookieHeaders: string[]): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const header of setCookieHeaders) {
    const [pair] = header.split(";");
    const idx = pair.indexOf("=");
    jar[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return jar;
}
function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login(email: string, password: string): Promise<Record<string, string>> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfCookies = parseCookies(csrfRes.headers.getSetCookie());
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const signinRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(csrfCookies) },
    body: new URLSearchParams({ email, password, csrfToken, callbackUrl: `${BASE}/`, json: "true" }).toString(),
    redirect: "manual",
  });
  const signinCookies = parseCookies(signinRes.headers.getSetCookie());
  return { ...csrfCookies, ...signinCookies };
}

async function upload(cookies: Record<string, string>, label: string) {
  const res = await fetch(`${BASE}/api/bank-statements`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(cookies) },
    body: JSON.stringify({ fileUrl: BLOB_URL, fileName: "Remitrak_Test_Statement.pdf" }),
  });
  const json = await res.json();
  const status = json?.upload?.status;
  const err = json?.upload?.errorMessage;
  console.log(`  [${label}] http=${res.status} upload.status=${status}${err ? ` error="${err}"` : ""}`);
  return { status, err, id: json?.upload?.id as string | undefined };
}

async function main() {
  const email = `pdf-2-4-5-stress-${Date.now()}@invoiceguard.local`;
  const password = "TempTestPassword123!";
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  console.log(`Created test user ${user.id}`);

  try {
    const cookies = await login(email, password);
    const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookieHeader(cookies) } });
    const session = await sessionRes.json();
    if (!session?.user) throw new Error("login failed, aborting");
    console.log("Logged in.");

    console.log("Running 15 SEQUENTIAL uploads (pdf-parse@2.4.5 build)...");
    for (let i = 1; i <= 15; i++) {
      await upload(cookies, `sequential ${i}`);
    }

    console.log("\nRunning 20 CONCURRENT uploads (pdf-parse@2.4.5 build)...");
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => upload(cookies, `concurrent ${i + 1}`))
    );

    console.log("\nRunning a SECOND round of 20 CONCURRENT uploads immediately after (same warm process)...");
    const results2 = await Promise.all(
      Array.from({ length: 20 }, (_, i) => upload(cookies, `concurrent-round2 ${i + 1}`))
    );

    const allFailed = [...results, ...results2].filter((r) => r.status === "failed");
    console.log(`\nTotal failures across 40 concurrent requests: ${allFailed.length}`);
  } finally {
    console.log("\nCleaning up test fixtures...");
    await prisma.bankTransaction.deleteMany({ where: { ownerId: user.id } });
    await prisma.bankStatementUpload.deleteMany({ where: { ownerId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log("Cleanup complete.");
  }
}

main()
  .catch((e) => {
    console.error("SCRIPT FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
