"""
Pydantic schemas for API request/response validation.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ===== Config Schemas =====
class ValidateKeyRequest(BaseModel):
    api_key: str = Field(..., min_length=10, description="Gemini API Key")


class ValidateKeyResponse(BaseModel):
    valid: bool
    message: str


# ===== Session Schemas =====
class SessionCreate(BaseModel):
    pass


class SessionResponse(BaseModel):
    id: str
    status: str
    created_at: datetime
    document_count: int = 0
    
    class Config:
        from_attributes = True


# ===== Document Schemas =====
class DocumentResponse(BaseModel):
    id: str
    filename: str
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int


# ===== Cluster Schemas =====
class ClusterBase(BaseModel):
    title: str
    sources_json: dict = Field(default_factory=dict)


class ClusterCreate(ClusterBase):
    session_id: str


class ClusterUpdate(BaseModel):
    title: Optional[str] = None
    sources_json: Optional[dict] = None


class ClusterResponse(ClusterBase):
    id: str
    session_id: str
    order_index: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class ClusterListResponse(BaseModel):
    clusters: List[ClusterResponse]
    total: int


class ClusterMergeRequest(BaseModel):
    cluster_ids: List[str] = Field(..., min_length=2)
    new_title: str


class ClusterSplitRequest(BaseModel):
    cluster_id: str
    split_config: dict  # Configuration for how to split


# ===== Note Schemas =====
class NoteResponse(BaseModel):
    id: str
    cluster_id: str
    markdown_content: str
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class NoteListResponse(BaseModel):
    notes: List[NoteResponse]
    total: int


# ===== Generation Schemas =====
class PromptOptions(BaseModel):
    """Options for prompt customization."""
    use_default: bool = True  # True = use default prompt, False = use custom
    language: str = "en"  # "en" or "id"
    depth: str = "balanced"  # "concise", "balanced", or "indepth"
    custom_prompt: Optional[str] = None  # Used when use_default=False


class GenerateRequest(BaseModel):
    session_id: str
    cluster_ids: Optional[List[str]] = None  # None means generate all
    prompt_options: Optional[PromptOptions] = None  # None means default balanced English


class GenerateResponse(BaseModel):
    task_id: str
    status: str
    message: str


class GenerationStatus(BaseModel):
    task_id: str
    status: str  # pending, processing, completed, failed
    progress: float  # 0.0 to 1.0
    current_cluster: Optional[str] = None
    completed_clusters: List[str] = []
    failed_clusters: List[str] = []


# ===== Export Schemas =====
class ExportRequest(BaseModel):
    session_id: str
    format: str = "markdown"  # markdown, pdf


# ===== GitHub Schemas =====
class GitHubConfigRequest(BaseModel):
    pat: str = Field(..., description="Personal Access Token")
    repo: str = Field(..., description="Repository in format owner/repo")
    path: str = Field(default="cornell-notes", description="Target path in repository")


class GitHubSyncRequest(BaseModel):
    session_id: str
    note_ids: Optional[List[str]] = None  # None means sync all


class GitHubSyncResponse(BaseModel):
    success: bool
    synced_files: List[str]
    message: str
