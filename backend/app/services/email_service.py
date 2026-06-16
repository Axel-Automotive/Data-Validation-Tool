"""SMTP email delivery for validation reports (Microsoft 365 / Outlook by default)."""
from __future__ import annotations
import os
import re
import smtplib
import ssl
from email.message import EmailMessage

from fastapi import HTTPException

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _cfg() -> dict:
    user = os.getenv("SMTP_USER", "").strip()
    return {
        "host": os.getenv("SMTP_HOST", "smtp.office365.com").strip(),
        "port": int(os.getenv("SMTP_PORT", "587") or 587),
        "user": user,
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from": os.getenv("SMTP_FROM", "").strip() or user,
        "from_name": os.getenv("SMTP_FROM_NAME", "AXEL Validator").strip(),
    }


def is_configured() -> bool:
    c = _cfg()
    return bool(c["user"] and c["password"])


def status() -> dict:
    """Non-secret config snapshot for the UI (never returns the password)."""
    c = _cfg()
    return {
        "configured": bool(c["user"] and c["password"]),
        "host": c["host"],
        "port": c["port"],
        "from": c["from"],
    }


def valid_email(addr: str) -> bool:
    return bool(_EMAIL_RE.match((addr or "").strip()))


def clean_recipients(recipients: list[str]) -> list[str]:
    """Trim, dedupe (case-insensitive), and validate a recipient list."""
    seen, out = set(), []
    for r in recipients or []:
        r = (r or "").strip()
        if not r:
            continue
        if not valid_email(r):
            raise HTTPException(400, f"Invalid email address: {r}")
        if r.lower() not in seen:
            seen.add(r.lower())
            out.append(r)
    return out


def send_report(
    to: list[str],
    subject: str,
    body: str,
    attachment_bytes: bytes | None = None,
    filename: str = "ValidationReport.xlsx",
) -> dict:
    c = _cfg()
    if not c["user"] or not c["password"]:
        raise HTTPException(
            400,
            "Email is not configured. Set SMTP_USER and SMTP_PASSWORD in backend/.env "
            "(see backend/.env.example).",
        )
    recipients = clean_recipients(to)
    if not recipients:
        raise HTTPException(400, "No valid recipients to send to.")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f'{c["from_name"]} <{c["from"]}>' if c["from_name"] else c["from"]
    msg["To"] = ", ".join(recipients)
    msg.set_content(body)

    if attachment_bytes:
        msg.add_attachment(
            attachment_bytes, maintype="application",
            subtype=_XLSX.split("/", 1)[1], filename=filename,
        )

    try:
        with smtplib.SMTP(c["host"], c["port"], timeout=30) as server:
            server.ehlo()
            server.starttls(context=ssl.create_default_context())
            server.login(c["user"], c["password"])
            server.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(
            502,
            "SMTP authentication failed. Check SMTP_USER / SMTP_PASSWORD "
            "(M365 with MFA requires an app password and SMTP AUTH enabled).",
        )
    except Exception as e:  # connection, TLS, recipient refused, etc.
        raise HTTPException(502, f"Failed to send email: {e}")

    return {"sent": True, "recipients": recipients}
