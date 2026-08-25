import type { Finding } from "../finding.js";
import type { InvoiceModel } from "../model/schema.js";
import { finding } from "./catalogue.js";

const DAY_MS = 86_400_000;

/** Parse an ISO calendar date into a UTC day number; undefined if not YYYY-MM-DD (XSD reports that). */
function day(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return undefined;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? undefined : Math.floor(t / DAY_MS);
}

export interface DateOptions {
  today: Date;
  /** Days an issue date may lie ahead of `today` before it is flagged (clock skew, time zones). */
  futureToleranceDays: number;
}

export function checkDates(m: InvoiceModel, opts: DateOptions): Finding[] {
  const out: Finding[] = [];
  const today = Math.floor(opts.today.getTime() / DAY_MS);
  const issue = day(m.issueDate);

  if (issue !== undefined) {
    if (issue > today + opts.futureToleranceDays) {
      out.push(
        finding(
          "KONTOR-PLAUS-DATE-FUTURE",
          `Issue date ${m.issueDate} lies ${issue - today} day(s) in the future`,
          "/issueDate",
          ["BT-2"],
        ),
      );
    } else if (today - issue > 365) {
      out.push(
        finding(
          "KONTOR-PLAUS-DATE-STALE",
          `Issue date ${m.issueDate} is ${today - issue} days ago`,
          "/issueDate",
          ["BT-2"],
        ),
      );
    }
    const due = day(m.dueDate);
    if (due !== undefined && due < issue) {
      out.push(
        finding(
          "KONTOR-PLAUS-DATE-DUE-BEFORE-ISSUE",
          `Due date ${m.dueDate} precedes issue date ${m.issueDate}`,
          "/dueDate",
          ["BT-9", "BT-2"],
        ),
      );
    }
  }

  const period = (
    p: { start?: string | undefined; end?: string | undefined } | undefined,
    loc: string,
    bt: string[],
  ) => {
    const s = day(p?.start);
    const e = day(p?.end);
    if (s !== undefined && e !== undefined && e < s) {
      out.push(
        finding(
          "KONTOR-PLAUS-DATE-PERIOD",
          `Period ends ${p?.end} before it starts ${p?.start}`,
          loc,
          bt,
        ),
      );
    }
  };
  period(m.invoicePeriod, "/invoicePeriod", ["BT-73", "BT-74"]);
  m.lines.forEach((line, i) => {
    period(line.period, `/lines/${i}/period`, ["BT-134", "BT-135"]);
  });
  return out;
}
