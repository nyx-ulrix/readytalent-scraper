// Self-check for the job export. Run: node test/csv.test.ts
import assert from "node:assert/strict";
import { toCsv } from "../src/csv.ts";

const out = toCsv([["Title", "Notes"], ['Analyst, "Data"', "line 1\nline 2"], [42, null]]);
assert.ok(out.startsWith("﻿"), "BOM so Excel reads UTF-8 (e.g. en dashes, Chinese names)");
assert.equal(out.slice(1), '"Title","Notes"\r\n"Analyst, ""Data""","line 1\nline 2"\r\n"42",""\r\n');
console.log("csv self-check OK");
