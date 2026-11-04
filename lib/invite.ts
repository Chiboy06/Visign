// Calendar invites for scheduled calls: no accounts or server needed, the room code is the meeting.

export type Invite = { title: string; start: Date; minutes: number; link: string };

/** 20261104T180000Z: the UTC form both iCalendar and Google Calendar accept. */
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const end = (i: Invite) => new Date(i.start.getTime() + i.minutes * 60_000);
const details = (i: Invite) => `Join the Visign call: ${i.link}`;

/** RFC 5545 text escaping: backslash, semicolon, comma and newlines. */
const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

export function googleCalendarUrl(i: Invite) {
  const q = new URLSearchParams({ action: "TEMPLATE", text: i.title, dates: `${utc(i.start)}/${utc(end(i))}`, details: details(i), location: i.link });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** An .ics file for Outlook, Apple Calendar and others. */
export function icsFile(i: Invite, uid: string) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Visign//Scheduled call//EN",
    "BEGIN:VEVENT",
    `UID:${uid}@visign`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(i.start)}`,
    `DTEND:${utc(end(i))}`,
    `SUMMARY:${esc(i.title)}`,
    `DESCRIPTION:${esc(details(i))}`,
    `LOCATION:${esc(i.link)}`,
    `URL:${i.link}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
