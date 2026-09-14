import { describe, expect, it } from "vitest";
import { matchesClientSearch } from "./clientSearch";

describe("matchesClientSearch", () => {
  const client = { name: "Adaeze Okonkwo", email: "adaeze@example.com" };

  it("matches a partial, case-insensitive substring of the name", () => {
    expect(matchesClientSearch(client, "oko")).toBe(true);
    expect(matchesClientSearch(client, "OKO")).toBe(true);
  });

  it("matches a partial, case-insensitive substring of the email", () => {
    expect(matchesClientSearch(client, "ADAEZE@EX")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesClientSearch(client, "zzz")).toBe(false);
  });

  it("treats an empty or whitespace-only query as matching everything", () => {
    expect(matchesClientSearch(client, "")).toBe(true);
    expect(matchesClientSearch(client, "   ")).toBe(true);
  });
});
