// Self-check for pay normalisation. Run: node test/pay.test.ts
import assert from "node:assert/strict";
import { monthlyPay, payPasses } from "../src/pay.ts";

assert.equal(monthlyPay("$72,000 - $96,000 a year"), 6000);
assert.equal(monthlyPay("$4,000 - $8,000 a month"), 4000);
assert.equal(monthlyPay("$800 - $1,100 a month"), 800);
assert.equal(monthlyPay("$20 an hour"), 3460);
assert.equal(monthlyPay("$2,500"), 2500, "ReadyTalent allowances are monthly");
assert.equal(monthlyPay("SGD 5k - 6k per month"), 5000);
assert.equal(monthlyPay(""), 0);
assert.ok(payPasses("", ""));
assert.ok(!payPasses("", "shown"));
assert.ok(payPasses("$72,000 a year", "5000") && !payPasses("$72,000 a year", "8000"));
console.log("pay self-check OK");
