"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type KeyboardEvent } from "react";
import { Button } from "@/components/Button";
import { ButtonLink } from "@/components/ButtonLink";
import { Dropdown } from "@/components/Dropdown";
import { BackIcon, CalendarIcon, ConfirmIcon, MailIcon, NextPageIcon, PrevPageIcon, SendIcon } from "@/core/ui/icons";
import {
  DEMO_TIMES, addDays, calendarMonths, dayOfMonth, dayStatus, formatDemoDate,
  type DayStatus, type DemoWindow, type DemoCalendar, type DemoAvailability,
} from "@/features/demo-requests/slots";
import { submitDemoRequest } from "./actions";
import {
  BRANCH_RANGES, EMPTY_DEMO_FORM, FIELD_ORDER, INDIAN_STATES, MEMBER_RANGES, normalizeDemoPhone, validateDemoRequest,
  type DemoFormValues,
} from "@/features/demo-requests/validation";
import { ClockIcon, GymsIcon, RetryIcon } from '@/core/ui/icons';

export type PreviewState = "errors" | "sending" | "success" | "returning";

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LABEL = "text-[11px] font-bold uppercase tracking-[0.12em] text-mute";
const INPUT =
  "min-h-12 w-full border-[1.5px] bg-paper px-3.5 text-base text-ink outline-none focus:border-ink rounded-none";
const FIELD_ERROR = "text-[12.5px] font-medium text-accent";
const PANE_HEADING = "border-b border-line pb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink";

const edge = (err?: string) => (err ? "border-accent" : "border-line");

/** Sample values used only by `?preview=` (dev) to land on a design state. */
const PREVIEW_VALUES: DemoFormValues = {
  gym: "FitZone Gym", name: "Ahmed Khan", phone: "9876543210", email: "ahmed@fitzone.in",
  city: "Hyderabad", state: "Telangana", branches: "1", members: "100–300", message: "",
};
const PREVIEW_BAD: DemoFormValues = { ...PREVIEW_VALUES, name: "", phone: "98765", email: "ahmed@fitzone", members: "" };

type Mode = "form" | "sending" | "success" | "returning";

export function BookDemoView({ window: win, previewState, calendar: initialCalendar, marketingOrigin, supportEmail }: {
  window: DemoWindow; previewState?: PreviewState; calendar: DemoCalendar | null; marketingOrigin: string; supportEmail: string;
}) {
  const contactMailto = `mailto:${supportEmail}?subject=MyFitDesk%20demo`;
  const months = useMemo(() => calendarMonths(win), [win]);
  const previewDate = useMemo(() => {
    for (let i = 2; i < 20; i++) {
      const key = addDays(win.today, i);
      if (dayStatus(key, win) === "open") return key;
    }
    return win.earliest;
  }, [win]);

  const filledPreview = previewState && previewState !== "errors";
  const [values, setValues] = useState<DemoFormValues>(
    previewState === "errors" ? PREVIEW_BAD : filledPreview ? PREVIEW_VALUES : EMPTY_DEMO_FORM,
  );
  const [date, setDate] = useState<string | null>(filledPreview ? previewDate : null);
  const [time, setTime] = useState<number | null>(filledPreview ? 12 : null);
  const [monthIdx, setMonthIdx] = useState(0);
  const [showErrors, setShowErrors] = useState(previewState === "errors");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [mode, setMode] = useState<Mode>(previewState === "success" || previewState === "returning" || previewState === "sending" ? previewState : "form");
  const [submitError, setSubmitError] = useState("");
  const [calendar, setCalendar] = useState(initialCalendar);
  const [openSlots, setOpenSlots] = useState<number[]>([]);
  const [slotError, setSlotError] = useState("");
  const [website, setWebsite] = useState("");
  const formRef = useRef<HTMLDivElement>(null);
  const slotRequest = useRef<AbortController | null>(null);
  const submitLock = useRef(false);
  const attempt = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => () => slotRequest.current?.abort(), []);

  const errors = showErrors ? validateDemoRequest(values, date, time) : {};
  const errorCount = Object.keys(errors).length;
  const sending = mode === "sending";
  const done = mode === "success" || mode === "returning";
  const hasPick = date !== null && time !== null;

  const set = <K extends keyof DemoFormValues>(key: K, value: DemoFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function scrollToForm() {
    const el = formRef.current;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function pickDate(key: string) {
    slotRequest.current?.abort();
    const controller = new AbortController();
    slotRequest.current = controller;
    setDate(key);
    setTime(null);
    setOpenSlots([]);
    setSlotError("");
    setSlotsLoading(true);
    try {
      const response = await fetch(`/book-demo/availability?date=${encodeURIComponent(key)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Availability unavailable");
      const result: DemoAvailability = await response.json();
      if (controller.signal.aborted || slotRequest.current !== controller) return;
      setOpenSlots(result.openSlots);
      setCalendar((previous) => ({ ...previous, [key]: result.status }));
    } catch {
      if (!controller.signal.aborted) setSlotError("We couldn't load times. Please try again.");
    } finally {
      if (!controller.signal.aborted && slotRequest.current === controller) setSlotsLoading(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitLock.current || slotsLoading) return;
    const errs = validateDemoRequest(values, date, time);
    if (Object.keys(errs).length || date === null || time === null) {
      setShowErrors(true);
      const first = firstInvalidField(errs);
      setTimeout(() => document.getElementById(`bd-${first}`)?.focus(), 0);
      return;
    }
    setSubmitError("");
    setMode("sending");
    submitLock.current = true;
    const signature = JSON.stringify({ values, date, time });
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    const requestId = attempt.current.id;
    startTransition(async () => {
      try {
        const result = await submitDemoRequest({ ...values, date, time, website, requestId });
        if (!result.ok) {
          setMode("form");
          setSubmitError(result.error);
          if (result.error.includes("no longer available")) await pickDate(date);
          return;
        }
        setMode(result.returning ? "returning" : "success");
        scrollToForm();
      } catch {
        setMode("form");
        setSubmitError("We couldn't send your request. Please try again in a little while.");
      } finally { submitLock.current = false; }
    });
  }

  const month = months[monthIdx];
  const slotsOpen = openSlots.length;
  const digits = normalizeDemoPhone(values.phone);

  return (
    <div className="min-h-screen bg-sand sm:px-4 sm:py-6 lg:px-6">
      <div className="mx-auto max-w-[1280px] overflow-hidden border-[1.5px] border-ink bg-paper">
        <header className="flex items-center gap-3 border-b-[1.5px] border-ink px-4 py-2.5 sm:px-10 lg:px-16">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-ink text-[11px] font-bold text-hi">MF</span>
          <span className="mr-auto text-xs font-bold uppercase tracking-[0.13em]">MyFitDesk</span>
          <a href={contactMailto} className="flex min-h-11 items-center px-1 text-[13px] font-bold text-ink hover:text-accent">
            Contact us
          </a>
        </header>

        <section aria-labelledby="bd-hero" className="flex flex-col gap-[18px] border-b-[1.5px] border-ink px-[18px] pb-8 pt-9 sm:px-10 sm:pb-12 sm:pt-[52px] lg:px-16 lg:pb-16 lg:pt-[72px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Book a demo</span>
          <h1 id="bd-hero" className="font-display text-[26px] leading-[1.02] tracking-[-0.03em] sm:text-[50px] lg:text-[64px]">
            See MyFitDesk in action
          </h1>
          <p className="max-w-[560px] text-pretty text-[15.5px] leading-[1.55] text-mute sm:text-[17px]">
            A short, personal walkthrough for gym owners. Pick a time that suits you and we&apos;ll show you how MyFitDesk would
            work for your gym. No account needed.
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            <Button variant="primary" size="lg" icon={CalendarIcon} onClick={scrollToForm}>Book a demo</Button>
            <ButtonLink href={contactMailto} variant="secondary" size="lg" icon={MailIcon}>Contact us</ButtonLink>
          </div>
          <span className="text-[12.5px] text-mute2">30-minute call · Mon–Sat, 10 AM–7 PM IST</span>
        </section>

        <div ref={formRef} className="scroll-mt-3 bg-paper px-4 pb-9 pt-7 sm:px-10 sm:pb-12 sm:pt-10 lg:px-16 lg:pb-16 lg:pt-12">
          {done ? (
            <section aria-labelledby="bd-done" role="status" className="mx-auto flex max-w-[640px] flex-col gap-[22px] border-[1.5px] border-ink px-[18px] py-6 sm:px-9 sm:py-9">
              <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center bg-ink text-hi">
                <ConfirmIcon size={24} strokeWidth={2.2} />
              </span>
              <div className="flex flex-col gap-2.5">
                <h2 id="bd-done" className="text-balance font-display text-2xl leading-[1.15] tracking-[-0.02em] sm:text-[30px]">
                  Your demo request has been received.
                </h2>
                <p className="text-pretty text-[15px] leading-[1.6] text-mute">
                  Thanks, {(values.name || "there").split(" ")[0]}. We&apos;ll contact you on +91 {digits.slice(0, 5)} {digits.slice(5)} to
                  confirm the time, usually within one working day. Your slot isn&apos;t booked until we confirm it.
                </p>
              </div>
              {mode === "returning" ? (
                <div className="flex items-start gap-3 border-[1.5px] border-line bg-sand px-4 py-3.5">
                  <WhatsAppGlyph />
                  <span className="flex flex-col gap-[3px]">
                    <span className="text-sm font-bold">Looks like we&apos;ve spoken before</span>
                    <span className="text-[13.5px] leading-[1.55] text-mute">
                      We&apos;ve added this request to your existing conversation, so we&apos;ll pick up where we left off.
                    </span>
                  </span>
                </div>
              ) : null}
              <dl className="grid grid-cols-1 border-t-[1.5px] border-ink sm:grid-cols-2">
                {[
                  ["Gym", values.gym],
                  ["Requested date", date ? formatDemoDate(date) : "—"],
                  ["Preferred time", time !== null ? `${DEMO_TIMES[time].label} IST` : "—"],
                  ["Contact", values.name],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1 border-b border-line py-3.5">
                    <dt className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-mute2">{k}</dt>
                    <dd className="m-0 text-[15px] font-bold">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-center gap-2 self-start border-[1.5px] border-ink px-2.5 py-1.5">
                <span aria-hidden="true" className="h-2 w-2 border-[1.5px] border-ink bg-hi" />
                <span className="text-[11.5px] font-bold uppercase tracking-[0.11em]">Awaiting confirmation</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-[18px]">
                <ButtonLink href={marketingOrigin} variant="primary" size="lg" icon={BackIcon}>Back to MyFitDesk</ButtonLink>
                <span className="text-[13px] text-mute">
                  Need to change something?{" "}
                  <a href={`mailto:${supportEmail}?subject=Change%20my%20demo%20request`} className="font-bold text-accent hover:text-ink">Email us</a>
                </span>
              </div>
            </section>
          ) : (
            <form onSubmit={onSubmit} noValidate aria-labelledby="bd-form-h" className="mx-auto flex max-w-[1120px] flex-col gap-[18px]">
              <div aria-hidden="true" className="hidden">
                <label htmlFor="bd-website">Website</label>
                <input id="bd-website" name="website" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <h2 id="bd-form-h" className="font-display text-[22px] tracking-[-0.02em] sm:text-[26px]">Request a demo</h2>
                <p className="text-sm text-mute">Takes about a minute. All fields are required unless marked optional.</p>
              </div>

              <div className="grid grid-cols-1 border-[1.5px] border-ink lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <fieldset disabled={sending} className={`m-0 flex min-w-0 flex-col gap-[18px] border-0 p-4 sm:p-6 lg:px-7 lg:py-[26px] ${sending ? "opacity-55" : ""}`}>
                  <legend className="contents" />
                  <span className={PANE_HEADING}>01 · Your gym</span>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-[18px] sm:grid-cols-2">
                    <TextField id="gym" label="Gym name" autoComplete="organization" placeholder="e.g. FitZone Gym" value={values.gym} error={errors.gym} onChange={(v) => set("gym", v)} />
                    <TextField id="name" label="Your name" autoComplete="name" placeholder="Full name" value={values.name} error={errors.name} onChange={(v) => set("name", v)} />

                    <Field id="phone" label="Phone / WhatsApp" error={errors.phone}>
                      <div className="flex min-w-0">
                        <span className={`flex items-center border-[1.5px] border-r-0 bg-sand px-3 text-[15px] font-bold text-mute ${edge(errors.phone)}`}>+91</span>
                        <input
                          id="bd-phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile"
                          value={values.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!errors.phone}
                          aria-describedby={errors.phone ? "bd-phone-err" : undefined}
                          className={`${INPUT} min-w-0 flex-1 ${edge(errors.phone)}`}
                        />
                      </div>
                    </Field>

                    <TextField id="email" label="Email" type="email" autoComplete="email" placeholder="you@yourgym.com" value={values.email} error={errors.email} onChange={(v) => set("email", v)} />
                    <TextField id="city" label="City" autoComplete="address-level2" placeholder="e.g. Hyderabad" value={values.city} error={errors.city} onChange={(v) => set("city", v)} />

                    <Field id="state" label="State" error={errors.state}>
                      <Dropdown
                        id="bd-state" value={values.state} onChange={(v) => set("state", v)} aria-invalid={!!errors.state} ariaLabel="State" disabled={sending}
                        aria-describedby={errors.state ? "bd-state-err" : undefined}
                        options={[{ value: "", label: "Choose state" }, ...INDIAN_STATES.map((s) => ({ value: s, label: s }))]}
                        className={`min-h-12 text-base ${edge(errors.state)}`}
                      />
                    </Field>

                    <div className="flex min-w-0 flex-col gap-[7px]">
                      <span id="bd-branches-l" className={LABEL}>Number of branches</span>
                      <div
                        id="bd-branches" role="radiogroup" aria-labelledby="bd-branches-l" tabIndex={-1}
                        onKeyDown={radioNavigation}
                        aria-describedby={errors.branches ? "bd-branches-err" : undefined}
                        className={`grid grid-cols-4 border-[1.5px] outline-none ${edge(errors.branches)}`}
                      >
                        {BRANCH_RANGES.map((b, i) => {
                          const on = values.branches === b;
                          return (
                            <Button icon={GymsIcon}
                              key={b} variant="surface" size="custom" role="radio" aria-checked={on} onClick={() => set("branches", b)}
                              tabIndex={on || (!values.branches && i === 0) ? 0 : -1}
                              className={`min-h-[45px] items-center justify-center border-0 text-[15px] font-bold ${i < BRANCH_RANGES.length - 1 ? "border-r border-line" : ""} ${on ? "bg-ink text-hi" : "bg-paper text-ink hover:bg-sand"}`}
                            >
                              {b}
                            </Button>
                          );
                        })}
                      </div>
                      {errors.branches ? <span id="bd-branches-err" role="alert" className={FIELD_ERROR}>{errors.branches}</span> : null}
                    </div>

                    <Field id="members" label="Approx. member count" error={errors.members}>
                      <Dropdown
                        id="bd-members" value={values.members} onChange={(v) => set("members", v)} aria-invalid={!!errors.members} ariaLabel="Approximate member count" disabled={sending}
                        aria-describedby={errors.members ? "bd-members-err" : undefined}
                        options={[{ value: "", label: "Choose a range" }, ...MEMBER_RANGES.map((m) => ({ value: m, label: m }))]}
                        className={`min-h-12 text-base ${edge(errors.members)}`}
                      />
                    </Field>
                  </div>

                  <div className="flex flex-col gap-[7px]">
                    <label htmlFor="bd-message" className={`${LABEL} flex gap-2`}>
                      Anything you want us to know <span className="font-medium normal-case tracking-normal text-mute2">(optional)</span>
                    </label>
                    <textarea
                      id="bd-message" rows={3} maxLength={1000} placeholder="e.g. We currently track renewals on paper" value={values.message}
                      aria-invalid={!!errors.message} aria-describedby={errors.message ? "bd-message-err" : undefined}
                      onChange={(e) => set("message", e.target.value)}
                      className="w-full resize-y rounded-none border-[1.5px] border-line bg-paper px-3.5 py-3 text-base leading-normal text-ink outline-none focus:border-ink"
                    />
                    {errors.message ? <span id="bd-message-err" role="alert" className={FIELD_ERROR}>{errors.message}</span> : null}
                  </div>
                </fieldset>

                <fieldset disabled={sending} className={`m-0 flex min-w-0 flex-col gap-[18px] border-0 border-t-[1.5px] border-ink p-4 sm:p-6 lg:border-l-[1.5px] lg:border-t-0 lg:px-7 lg:py-[26px] ${sending ? "opacity-55" : ""}`}>
                  <legend className="contents" />
                  <span className={PANE_HEADING}>02 · Pick a time</span>
                  {!calendar ? <p role="status" className="text-[13px] text-mute">Choose a date to check available times.</p> : null}

                  <div id="bd-date" tabIndex={-1} className="flex flex-col gap-3 outline-none">
                    <div className="flex items-center gap-2">
                      <span className={`${LABEL} mr-auto`}>Preferred date</span>
                      <div className="flex items-center gap-1.5">
                        <MonthStep label="Previous month" disabled={monthIdx === 0} onClick={() => setMonthIdx(monthIdx - 1)} />
                        <span aria-live="polite" className="min-w-[104px] text-center text-sm font-bold">{month.label}</span>
                        <MonthStep label="Next month" disabled={monthIdx >= months.length - 1} onClick={() => setMonthIdx(monthIdx + 1)} />
                      </div>
                    </div>

                    <div role="grid" aria-label={month.label} className="grid grid-cols-7 gap-1">
                      {WEEKDAY_HEADERS.map((w) => (
                        <span key={w} className="py-1 text-center text-[10.5px] font-bold uppercase tracking-[0.1em] text-mute2">
                          <span className="sm:hidden">{w[0]}</span><span className="hidden sm:inline">{w}</span>
                        </span>
                      ))}
                      {Array.from({ length: month.blanks }, (_, i) => <span key={`b${i}`} />)}
                      {month.days.map((key) => (
                        <DayCell key={key} dayKey={key} status={dayStatus(key, win, calendar ?? undefined)} selected={date === key} today={key === win.today} onPick={() => void pickDate(key)} />
                      ))}
                    </div>

                    <div aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-mute">
                      <Legend swatch="h-3 w-3 border-[1.5px] border-line" text="Available" />
                      <Legend swatch="h-3 w-3 bg-ink" text="Selected" />
                      <Legend swatch="h-3 w-3 bg-sand" text="Full or closed" />
                      <span className="flex items-center gap-1.5"><span className="text-xs font-bold text-mute3/70">00</span>Past / too soon</span>
                    </div>
                    {errors.date ? <span role="alert" className={FIELD_ERROR}>{errors.date}</span> : null}
                  </div>

                  <div id="bd-time" tabIndex={-1} className="flex flex-col gap-3 pt-1 outline-none">
                    <div className="flex items-baseline gap-2">
                      <span className={`${LABEL} mr-auto`}>Preferred time <span className="font-medium normal-case tracking-normal">· IST</span></span>
                      {date && !slotsLoading && !slotError ? <span className="text-[12.5px] text-mute2">{slotsOpen} of 18 open</span> : null}
                    </div>

                    {!date ? (
                      <div className="flex min-h-24 items-center justify-center border-[1.5px] border-dashed border-line p-4 text-center text-[13.5px] text-mute2">
                        Choose a date to see available times
                      </div>
                    ) : slotsLoading ? (
                      <div aria-busy="true" aria-label="Loading times" className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-3">
                        {Array.from({ length: 9 }, (_, i) => <span key={i} className="skeleton-shimmer block h-[46px]" />)}
                      </div>
                    ) : slotError ? (
                      <div role="alert" className="flex flex-col gap-3 border border-line p-4 text-[13.5px] text-mute">
                        <span>{slotError}</span>
                        <Button icon={RetryIcon} variant="secondary" onClick={() => void pickDate(date)}>Try again</Button>
                      </div>
                    ) : !slotsOpen ? (
                      <p role="status" className="border border-line p-4 text-[13.5px] text-mute">No times are available on this date. Please choose another date.</p>
                    ) : (
                      <div role="radiogroup" onKeyDown={radioNavigation} aria-label="Available times" className="grid max-h-none grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4 lg:max-h-[312px] lg:grid-cols-3">
                        {DEMO_TIMES.map((t) => {
                          const open = openSlots.includes(t.index);
                          const on = time === t.index;
                          return (
                            <Button icon={ClockIcon}
                              key={t.index} variant="surface" size="custom" role="radio" aria-checked={on} disabled={!open} onClick={() => setTime(t.index)}
                              tabIndex={on || (time === null && t.index === openSlots[0]) ? 0 : -1}
                              aria-label={t.label + (open ? "" : ", unavailable")}
                              className={`min-h-[46px] items-center justify-center text-[14.5px] font-bold disabled:opacity-100 ${on ? "border-ink bg-ink text-hi" : open ? "border-line bg-paper text-ink hover:border-ink" : "border-sand bg-sand text-mute3 line-through"}`}
                            >
                              {t.label}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                    {errors.time ? <span role="alert" className={FIELD_ERROR}>{errors.time}</span> : null}
                  </div>
                </fieldset>

                <div className="flex flex-col items-stretch gap-3.5 border-t-[1.5px] border-ink bg-sand p-4 sm:flex-row sm:items-center sm:px-6 sm:py-[18px] lg:col-span-2 lg:px-7">
                  <div className="mr-auto flex min-w-0 flex-col gap-1">
                    {hasPick ? (
                      <span className="flex flex-col gap-[3px]">
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-mute2">Your preferred slot</span>
                        <span className="text-[15px] font-bold">{formatDemoDate(date)} · {DEMO_TIMES[time].label} IST</span>
                      </span>
                    ) : null}
                    {errorCount ? (
                      <span role="alert" className="text-[13.5px] font-bold text-accent">
                        {errorCount === 1 ? "1 thing needs fixing before we can send this" : `${errorCount} things need fixing before we can send this`}
                      </span>
                    ) : null}
                    {submitError ? <span role="alert" className="text-[13.5px] font-bold text-accent">{submitError}</span> : null}
                    <span className="text-[12.5px] text-mute">We&apos;ll confirm the time with you before the demo.</span>
                  </div>
                  <Button type="submit" variant="primary" size="lg" icon={SendIcon} disabled={slotsLoading} pending={sending} pendingLabel="Sending request…" className="min-h-[52px] sm:min-w-[220px]">
                    Request demo
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-x-[18px] gap-y-2 border-t-[1.5px] border-ink px-4 py-2.5 text-xs text-mute sm:px-10 lg:px-16">
          <span className="mr-auto">© {win.today.slice(0, 4)} MyFitDesk</span>
          <a href={`mailto:${supportEmail}`} className="font-bold text-ink hover:text-accent">{supportEmail}</a>
        </footer>
      </div>
    </div>
  );
}

function radioNavigation(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
  const current = controls.indexOf(event.target as HTMLButtonElement);
  if (current < 0 || !controls.length) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1
    : (current + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + controls.length) % controls.length;
  controls[next].focus();
  controls[next].click();
}

/** The form's first invalid control id suffix (the `bd-` prefix is added by the caller). */
function firstInvalidField(errs: Record<string, string | undefined>): string {
  return FIELD_ORDER.find((k) => errs[k]) ?? "gym";
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-[7px]">
      <label htmlFor={`bd-${id}`} className={LABEL}>{label}</label>
      {children}
      {error ? <span id={`bd-${id}-err`} role="alert" className={FIELD_ERROR}>{error}</span> : null}
    </div>
  );
}

function TextField({ id, label, value, error, onChange, type = "text", placeholder, autoComplete }: {
  id: string; label: string; value: string; error?: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; autoComplete?: string;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <input
        id={`bd-${id}`} type={type} autoComplete={autoComplete} placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `bd-${id}-err` : undefined}
        className={`${INPUT} ${edge(error)}`}
      />
    </Field>
  );
}

function MonthStep({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button icon={label === 'Previous month' ? PrevPageIcon : NextPageIcon}
      variant="surface" size="custom" aria-label={label} disabled={disabled} onClick={onClick}
      className={`h-11 w-11 items-center justify-center border-line bg-transparent disabled:opacity-100 ${disabled ? "text-mute3/70" : "text-ink hover:border-ink"}`}
     />
  );
}

const STATUS_WORD: Record<DayStatus, string> = { open: "available", past: "not bookable", closed: "closed", full: "fully booked" };

function DayCell({ dayKey, status, selected, today, onPick }: { dayKey: string; status: DayStatus; selected: boolean; today: boolean; onPick: () => void }) {
  const style = selected
    ? "border-ink bg-ink font-bold text-hi"
    : status === "open"
      ? "border-line bg-paper font-bold text-ink hover:border-ink"
      : status === "past"
        ? "border-transparent bg-transparent font-medium text-mute3/70"
        : "border-sand bg-sand font-medium text-mute3 line-through";
  return (
    <Button icon={CalendarIcon}
      variant="surface" size="custom" disabled={status !== "open"} aria-pressed={selected} onClick={onPick}
      aria-label={`${formatDemoDate(dayKey)}, ${selected ? "selected" : STATUS_WORD[status]}`}
      className={`relative h-11 items-center justify-center p-0 text-[15px] disabled:opacity-100 sm:h-[46px] ${style}`}
    >
      {dayOfMonth(dayKey)}
      {today ? <span aria-hidden="true" className="absolute bottom-[5px] left-1/2 -ml-0.5 h-1 w-1 bg-accent" /> : null}
    </Button>
  );
}

function Legend({ swatch, text }: { swatch: string; text: string }) {
  return <span className="flex items-center gap-1.5"><span className={swatch} />{text}</span>;
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px shrink-0 text-ink">
      <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
    </svg>
  );
}
