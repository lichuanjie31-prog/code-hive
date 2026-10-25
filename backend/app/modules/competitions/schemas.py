from typing import Literal
from pydantic import BaseModel


class TrackView(BaseModel):
    id: str
    name: str
    requirements: str
    sourceIds: list[str]


class MilestoneView(BaseModel):
    id: str
    name: str
    scope: str
    trackIds: list[str]
    dateText: str | None
    certainty: str
    sourceIds: list[str]
    note: str | None = None


class SourceView(BaseModel):
    id: str
    title: str
    url: str
    kind: str
    checkedAt: str
    publishedAt: str | None


class AnalysisView(BaseModel):
    majors: str
    skills: str
    fit: str


class LinksView(BaseModel):
    official: str
    registration: str | None
    registrationLabel: str | None = None


class CompetitionView(BaseModel):
    id: str
    slug: str
    name: str
    shortName: str
    year: int
    edition: str
    summary: str
    eligibility: str
    status: str
    publicationStatus: Literal["published", "archived", "draft"]
    checkedAt: str
    directions: list[str]
    organizer: str
    organizerSourceId: str
    team: str
    officialSourceIds: list[str]
    requirements: list[str]
    notice: str
    analysis: AnalysisView
    links: LinksView
    sourceIds: list[str]
    sources: dict[str, SourceView]
    tracks: list[TrackView]
    timeline: list[MilestoneView]


class CompetitionListView(BaseModel):
    items: list[CompetitionView]
    total: int


class RelationView(BaseModel):
    competition: CompetitionView
    favorite: bool
    subscribed: bool


class RelationListView(BaseModel):
    items: list[RelationView]
    total: int
