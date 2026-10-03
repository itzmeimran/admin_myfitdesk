"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Dropdown } from "@/components/Dropdown";
import { IST_TIME_ZONE } from "@/core/dates/ist";
import type { GymTrend, TrendPoint } from "@/features/gyms/trend-types";

/**
 * "Payments & enrollments" — one chart, two axes (Claude Design: Gym Trend
 * Chart, minimal v2). Payments on the left axis in ink, new members on the
 * right axis in accent; no fill, no markers, dotted hairline grid. Hover, drag
 * on touch, or ←/→ on the focused plot to inspect a bucket. Each stat above the
 * chart is a toggle that hides its line (never both).
 *
 * Ranges are cut client-side from two dense server series, so switching never
 * refetches. 1D is the latest 24 clock hours (rolling), compared with the 24
 * before it. Everything is bucketed and labelled in IST.
 */

type RangeKey = "30d" | "7d" | "1d";
type Row = { d: Date; pay: number; txn: number; mem: number; hourly: boolean };

const RANGES: Record<RangeKey, { n: number; hourly: boolean; sub: string; cmp: string; every: number; everyNarrow: number }> = {
  "30d": { n: 30, hourly: false, sub: "Last 30 days · daily", cmp: "vs previous 30 days", every: 5, everyNarrow: 7 },
  "7d": { n: 7, hourly: false, sub: "Last 7 days · daily", cmp: "vs previous 7 days", every: 1, everyNarrow: 1 },
  "1d": { n: 24, hourly: true, sub: "Last 24 hours · hourly", cmp: "vs previous 24 hours", every: 4, everyNarrow: 6 },
};
const RANGE_OPTIONS = [
  { value: "30d", label: "1M" },
  { value: "7d", label: "1W" },
  { value: "1d", label: "1D" },
];

const INK = "var(--ink)";
const ACCENT = "var(--accent)";
const PAPER = "var(--paper)";
const LINE = "var(--line)";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const istFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23", weekday: "short",
});
/** Calendar parts of an instant as seen in IST, independent of the device zone. */
function istParts(d: Date) {
  const p = Object.fromEntries(istFormat.formatToParts(d).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month) - 1, day: Number(p.day), hour: Number(p.hour), dow: DOW.indexOf(p.weekday) };
}

const hr = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? " AM" : " PM"}`;

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function money(currency: string) {
  const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
  const symbol = fmt.formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  const indian = currency === "INR";
  const full = (n: number) => fmt.format(Math.round(n));
  const short = (n: number) => {
    if (n === 0) return `${symbol}0`;
    if (indian && n >= 100000) return `${symbol}${+(n / 100000).toFixed(1)}L`;
    if (!indian && n >= 1000000) return `${symbol}${+(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${symbol}${+(n / 1000).toFixed(1)}k`;
    return `${symbol}${n}`;
  };
  return { full, short };
}

const toRows = (points: TrendPoint[], hourly: boolean): Row[] =>
  points.map((p) => ({ d: new Date(p.at), pay: p.payMinor / 100, txn: p.txn, mem: p.mem, hourly }));

function delta(a: number, b: number) {
  if (!b) return { text: "—", up: true };
  const d = Math.round(((a - b) / b) * 100);
  return { text: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}%`, up: d >= 0 };
}

export function GymTrendChart({ trend, currency }: { trend: GymTrend; currency: string }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [hover, setHover] = useState<number | null>(null);
  const [show, setShow] = useState({ pay: true, mem: true });
  const [W, setW] = useState(760);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      if (w) setW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const R = RANGES[range];
  const all = toRows(R.hourly ? trend.hourly : trend.daily, R.hourly);
  const pts = all.slice(-R.n);
  const prev = all.slice(-2 * R.n, -R.n);
  const n = pts.length;
  const { full: inr, short } = money(currency);

  const width = Math.max(260, W);
  const narrow = width < 520;
  const H = narrow ? 250 : 320;
  const padL = narrow ? 44 : 54, padR = narrow ? 26 : 32, padT = 10, padB = 28;
  const pw = width - padL - padR, ph = H - padT - padB;
  const empty = pts.every((p) => p.pay === 0 && p.mem === 0);

  const pMax0 = empty ? 3000 : Math.max(...pts.map((p) => p.pay), 1);
  const pStep = niceStep(pMax0 / 3), pMax = pStep * Math.ceil(pMax0 / pStep);
  const mMax0 = Math.max(...pts.map((p) => p.mem), 1);
  const mStep = Math.max(1, Math.ceil(mMax0 / 3)), mMax = mStep * Math.max(1, Math.ceil(mMax0 / mStep));
  const X = (i: number) => padL + (n === 1 ? pw / 2 : (i * pw) / (n - 1));
  const YP = (v: number) => padT + ph - (v / pMax) * ph;
  const YM = (v: number) => padT + ph - (v / mMax) * ph;
  const f = (v: number) => v.toFixed(1);
  const line = (Y: (v: number) => number, key: "pay" | "mem") =>
    pts.map((p, i) => `${i ? "L" : "M"}${f(X(i))} ${f(Y(p[key]))}`).join(" ");

  const yLeft: Array<{ y: number; label: string }> = [];
  const gridD: string[] = [];
  for (let v = 0; v <= pMax + 1e-6; v += pStep) {
    const y = YP(v);
    yLeft.push({ y: Math.round(y), label: short(v) });
    if (v > 0) gridD.push(`M${padL} ${f(y)}H${width - padR}`);
  }
  const nT = Math.round(pMax / pStep);
  const yRight: Array<{ y: number; label: string }> = [];
  for (let k = 0; k <= nT; k++) {
    const v = (mMax * k) / nT;
    if (Math.abs(v - Math.round(v)) < 1e-6) yRight.push({ y: Math.round(padT + ph - (ph * k) / nT), label: String(Math.round(v)) });
  }

  const every = narrow ? R.everyNarrow : R.every;
  const xTicks: Array<{ x: number; label: string }> = [];
  pts.forEach((p, i) => {
    if ((n - 1 - i) % every) return;
    const t = istParts(p.d);
    const label = p.hourly ? hr(t.hour) : range === "7d" ? (narrow ? DOW[t.dow] : `${DOW[t.dow]} ${t.day}`) : `${t.day} ${MON[t.month]}`;
    xTicks.push({ x: Math.round(X(i)), label });
  });

  const sum = (rows: Row[], k: "pay" | "mem") => rows.reduce((s, p) => s + p[k], 0);
  const pay = sum(pts, "pay"), mem = sum(pts, "mem");
  const dp = delta(pay, sum(prev, "pay")), dm = delta(mem, sum(prev, "mem"));

  const toggle = (k: "pay" | "mem") => () =>
    setShow((s) => {
      const next = { ...s, [k]: !s[k] };
      return !next.pay && !next.mem ? s : next;
    });
  const stats = [
    { key: "pay" as const, label: "Payments", value: inr(pay), delta: dp, swatch: INK, on: show.pay },
    { key: "mem" as const, label: "New members", value: String(mem), delta: dm, swatch: ACCENT, on: show.mem },
  ];

  const hi = hover !== null && hover < n ? hover : null;
  let tip: null | { x: number; tipX: number; title: string; dots: Array<{ y: number; c: string }>; rows: Array<{ c: string; label: string; note: string; value: string }> } = null;
  if (hi !== null) {
    const p = pts[hi], x = X(hi), t = istParts(p.d), tw = 212;
    const title = p.hourly
      ? `${t.day} ${MON[t.month]} · ${hr(t.hour)}–${hr((t.hour + 1) % 24)}`
      : `${DOW[t.dow]}, ${t.day} ${MON[t.month]} ${t.year}`;
    let tipX = x + 14;
    if (tipX + tw > width) tipX = x - 14 - tw;
    tipX = Math.max(0, Math.min(width - tw, tipX));
    const dots: Array<{ y: number; c: string }> = [];
    const rows: Array<{ c: string; label: string; note: string; value: string }> = [];
    if (show.pay) {
      dots.push({ y: Math.round(YP(p.pay)), c: INK });
      rows.push({ c: PAPER, label: "Payments", note: `${p.txn} ${p.txn === 1 ? "transaction" : "transactions"}`, value: inr(p.pay) });
    }
    if (show.mem) {
      dots.push({ y: Math.round(YM(p.mem)), c: ACCENT });
      rows.push({ c: ACCENT, label: "New members", note: `enrolled ${p.hourly ? "this hour" : "this day"}`, value: String(p.mem) });
    }
    tip = { x: Math.round(x), tipX: Math.round(tipX), title, dots, rows };
  }

  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setHover(null);
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const c = hover ?? (e.key === "ArrowLeft" ? n : -1);
    setHover(Math.max(0, Math.min(n - 1, c + (e.key === "ArrowRight" ? 1 : -1))));
  };

  return (
    <div className="flex min-w-0 flex-col gap-[18px] border-[1.5px] border-line bg-paper p-[18px]">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[11.5px] text-mute2">{R.sub}</span>
        <div className="w-[92px] flex-shrink-0">
          <Dropdown
            value={range}
            options={RANGE_OPTIONS}
            ariaLabel="Date range"
            align="right"
            onChange={(v) => {
              setRange(v as RangeKey);
              setHover(null);
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-3.5">
        {stats.map((s) => (
          <Button
            key={s.key}
            variant="surface"
            onClick={toggle(s.key)}
            aria-pressed={s.on}
            title={`${s.on ? "Hide" : "Show"} ${s.key === "pay" ? "payments" : "members"} line`}
            className={`min-w-0 flex-col gap-[5px] border-0 bg-transparent p-0 text-left text-ink ${s.on ? "" : "opacity-40"}`}
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <span aria-hidden className="h-2 w-2 flex-shrink-0" style={{ background: s.swatch }} />
              <span className="truncate text-[12px] font-medium text-mute">{s.label}</span>
            </span>
            <span className="font-display text-[22px] leading-none tracking-[-0.03em]">{s.value}</span>
            <span className="text-[11.5px] text-mute">
              <span className="font-bold" style={{ color: s.delta.up ? INK : ACCENT }}>{s.delta.text}</span> {R.cmp}
            </span>
          </Button>
        ))}
      </div>

      <div ref={boxRef} className="relative w-full min-w-0 select-none overflow-x-clip" style={{ height: H }}>
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={`Line chart of payments received and new members, ${R.sub}. Total ${inr(pay)}, ${mem} new members.`}
          className="absolute left-0 top-0 block overflow-visible"
        >
          <path d={gridD.join(" ")} style={{ stroke: LINE }} strokeWidth={1} strokeDasharray="2 4" fill="none" />
          <path d={`M${padL} ${padT + ph}H${width - padR}`} style={{ stroke: LINE }} strokeWidth={1} fill="none" />
          {show.mem ? <path d={line(YM, "mem")} style={{ stroke: ACCENT }} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {show.pay ? <path d={line(YP, "pay")} style={{ stroke: INK }} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
        </svg>

        {yLeft.map((t) => (
          <span key={`l${t.y}`} className="absolute left-0 -translate-y-1/2 text-right text-[10.5px] tabular-nums text-mute2" style={{ top: t.y, width: padL - 8, opacity: show.pay ? 1 : 0.35 }}>
            {t.label}
          </span>
        ))}
        {yRight.map((t) => (
          <span key={`r${t.y}`} className="absolute -translate-y-1/2 text-[10.5px] tabular-nums text-accent" style={{ left: width - padR + 8, top: t.y, opacity: show.mem ? 1 : 0.35 }}>
            {t.label}
          </span>
        ))}
        {xTicks.map((t) => (
          <span key={`x${t.x}`} className="absolute -translate-x-1/2 whitespace-nowrap text-[10.5px] text-mute2" style={{ left: t.x, top: H - padB + 9 }}>
            {t.label}
          </span>
        ))}

        {empty ? (
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[12px] text-mute" style={{ top: padT + ph / 2 - 8 }}>
            No payments or new members in this period
          </span>
        ) : null}

        {tip ? (
          <>
            <span aria-hidden className="pointer-events-none absolute w-0 border-l border-mute3" style={{ left: tip.x, top: padT, height: ph }} />
            {tip.dots.map((d) => (
              <span key={d.c} aria-hidden className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_2px_var(--paper)]" style={{ left: tip.x, top: d.y, background: d.c }} />
            ))}
            <div role="status" className="pointer-events-none absolute flex w-[212px] flex-col gap-[9px] bg-ink px-3 pb-[11px] pt-2.5 text-paper" style={{ left: tip.tipX, top: padT + 4 }}>
              <span className="text-[11.5px] font-bold text-hi">{tip.title}</span>
              {tip.rows.map((r) => (
                <span key={r.label} className="flex items-start gap-2">
                  <span aria-hidden className="mt-[7px] h-[3px] w-2.5 flex-shrink-0" style={{ background: r.c }} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[11.5px] text-sand">{r.label}</span>
                    <span className="text-[10.5px] text-mute3">{r.note}</span>
                  </span>
                  <span className="whitespace-nowrap text-[14px] font-bold tabular-nums">{r.value}</span>
                </span>
              ))}
            </div>
          </>
        ) : null}

        <div
          tabIndex={0}
          role="group"
          aria-label="Chart. Use left and right arrow keys to step through points."
          onPointerMove={(e) => {
            const i = at(e);
            if (i !== hover) setHover(i);
          }}
          onPointerDown={(e) => {
            const i = at(e);
            if (i !== hover) setHover(i);
          }}
          onPointerLeave={(e) => {
            // A finger lifting also "leaves"; keep the touched point readable.
            if (e.pointerType === "mouse") setHover(null);
          }}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
          className="absolute cursor-crosshair outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          style={{ left: padL - 8, top: padT, width: pw + 16, height: ph + padB, touchAction: "pan-y" }}
        />
      </div>
    </div>
  );
}
