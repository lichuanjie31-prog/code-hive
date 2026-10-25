import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.security import normalize_username


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginInput(InputModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def valid_username(cls, value: str) -> str:
        value = normalize_username(value)
        if not re.fullmatch(r"[a-z0-9_.-]{3,64}", value):
            raise ValueError("登录名需为 3–64 位字母、数字、下划线、点或短横线")
        return value

class RegisterInput(LoginInput):
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)
    school: str = Field(min_length=1, max_length=200)
    reason: str = Field(min_length=1, max_length=3000)
    discovery: str = Field(min_length=1, max_length=500)
    contact: str | None = Field(default=None, max_length=200)

    @field_validator("display_name", "school", "reason", "discovery", "contact", mode="before")
    @classmethod
    def trim_profile(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class UserView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    display_name: str
    role: Literal["member", "admin"]
    membership_status: Literal["pending", "approved", "rejected", "suspended"]
    created_at: datetime


class AuthView(BaseModel):
    user: UserView
    csrf_token: str


class CsrfView(BaseModel):
    csrf_token: str
    contact_required: bool
