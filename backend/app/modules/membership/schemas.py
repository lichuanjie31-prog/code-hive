from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.auth.schemas import InputModel, UserView


class ReviewInput(InputModel):
    decision: Literal["approved", "rejected"]
    note: str = Field(min_length=1, max_length=3000)


class SuspendInput(InputModel):
    reason: str = Field(min_length=1, max_length=3000)


class ReapplyInput(InputModel):
    school: str = Field(min_length=1, max_length=200)
    reason: str = Field(min_length=1, max_length=3000)
    discovery: str = Field(min_length=1, max_length=500)
    contact: str | None = Field(default=None, max_length=200)


class ApplicationView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    school: str
    reason: str
    discovery: str
    contact: str | None
    status: Literal["pending", "approved", "rejected"]
    reviewer_id: int | None
    review_note: str | None
    reviewed_at: datetime | None
    created_at: datetime


class AdminApplicationView(ApplicationView):
    applicant: UserView
