from __future__ import annotations
from pydantic import BaseModel, Field
import uuid


class Condition(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str           # "sheet_diff" | "stacked" | "calc_diff" | "custom_rule"
    enabled: bool = True
    # type-specific config stored as a flexible dict:
    # sheet_diff   → { col_pairs: [{axel, dms}] }
    # stacked      → { axel_label, dms_label, control_axel, control_dms }
    # calc_diff    → { axel_label, dms_label, key_axel, key_dms, val_axel, val_dms }
    # custom_rule  → { axel_label, dms_label, key_axel, key_dms,
    #                  checks: [{ axel_col, dms_col, mode: "numeric"|"text", op, tolerance }] }
    config: dict = Field(default_factory=dict)


class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    conditions: list[Condition] = Field(default_factory=list)
    recipients: list[str] = Field(default_factory=list)   # report email recipients
    email_subject: str = ""                               # custom subject (blank → default)


# ── Request / Response shapes ─────────────────────────────────────────────────

class ClientCreateRequest(BaseModel):
    name: str


class EmailSettingsRequest(BaseModel):
    recipients: list[str] = Field(default_factory=list)
    subject: str = ""


class ConditionUpsertRequest(BaseModel):
    name: str
    type: str
    enabled: bool = True
    config: dict = Field(default_factory=dict)


class RunConditionRequest(BaseModel):
    client_id: str
    condition_id: str
    file_axel_id: str
    file_dms_id: str
    sheet_axel: str
    sheet_dms: str


class RunAllRequest(BaseModel):
    client_id: str
    file_axel_id: str
    file_dms_id: str
    sheet_axel: str
    sheet_dms: str
    email: bool = False                       # also email the report when done
    email_to: list[str] | None = None         # override saved recipients (optional)


# ── Schedules (automated recurring runs) ──────────────────────────────────────

class Schedule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    client_id: str
    file_axel_id: str
    file_dms_id: str
    sheet_axel: str
    sheet_dms: str
    hour: int = 8                             # 0-23, local time
    minute: int = 0                           # 0-59
    days: list[str] = Field(default_factory=lambda: ["mon", "tue", "wed", "thu", "fri"])
    recipients: list[str] = Field(default_factory=list)   # falls back to client's if empty
    enabled: bool = True
    last_run: str | None = None
    last_status: str | None = None


class ScheduleUpsertRequest(BaseModel):
    name: str
    client_id: str
    file_axel_id: str
    file_dms_id: str
    sheet_axel: str
    sheet_dms: str
    hour: int = 8
    minute: int = 0
    days: list[str] = Field(default_factory=lambda: ["mon", "tue", "wed", "thu", "fri"])
    recipients: list[str] = Field(default_factory=list)
    enabled: bool = True
