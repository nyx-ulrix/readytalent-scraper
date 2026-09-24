import { Fragment, type ReactNode } from "react";
import { PHONE, linkParts } from "./links";

/** Renders text with emails, URLs, bare domains (and phone numbers when asked) as real <a> links for clickable PDFs. */

export function Linkify({ text, phone = false }: { text: string; phone?: boolean }): ReactNode {
  if (phone && PHONE.test(text.trim())) return <a href={`tel:${text.replace(/[^\d+]/g, "")}`}>{text}</a>;
  return <>{linkParts(text).map((p, i) => (p.href ? <a key={i} href={p.href}>{p.text}</a> : <Fragment key={i}>{p.text}</Fragment>))}</>;
}
