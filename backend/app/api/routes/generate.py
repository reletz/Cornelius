"""
Note generation routes.
"""
import asyncio
import logging
import time
from datetime import datetime
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, async_session_maker
from app.core.security import get_api_key
from app.core.config import settings
from app.models.models import Session, Document, Cluster, Note
from app.schemas.schemas import (
    GenerateRequest,
    GenerateResponse,
    GenerationStatus,
    NoteResponse,
    NoteListResponse
)
from app.services.note_generator import note_generation_service

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory task tracking (for single-container deployment)
generation_tasks: Dict[str, GenerationStatus] = {}

# Semaphore for concurrent generation limiting
generation_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_GENERATIONS)


async def generate_notes_task(
    task_id: str,
    cluster_ids: list,
    api_key: str,
    session_id: str,
    prompt_options: dict = None,
    rate_limit_enabled: bool = True
):
    """Background task for note generation."""
    from sqlalchemy import delete
    
    status = generation_tasks[task_id]
    status.status = "processing"
    
    # Rate limit delay (in seconds) between API calls
    RATE_LIMIT_DELAY = 3.0  # 3 seconds between calls when enabled
    
    async with async_session_maker() as db:
        try:
            # Get documents for content
            doc_stmt = select(Document).where(
                Document.session_id == session_id,
                Document.status == "extracted"
            )
            doc_result = await db.execute(doc_stmt)
            documents = {doc.filename: doc.extracted_text for doc in doc_result.scalars().all()}
            
            # Get ALL clusters for this session to provide context
            all_clusters_stmt = select(Cluster).where(
                Cluster.session_id == session_id
            ).order_by(Cluster.order_index)
            all_clusters_result = await db.execute(all_clusters_stmt)
            all_clusters = list(all_clusters_result.scalars().all())
            
            # Build context about other clusters for uniqueness
            def get_other_clusters_context(current_cluster_id: str) -> List[dict]:
                """Get info about other clusters to avoid content overlap."""
                context = []
                for c in all_clusters:
                    if c.id != current_cluster_id:
                        context.append({
                            "title": c.title,
                            "keywords": c.sources_json.get("keywords", []),
                            "summary": c.sources_json.get("summary", "")
                        })
                return context
            
            for cluster_id in cluster_ids:
                async with generation_semaphore:
                    status.current_cluster = cluster_id
                    
                    # Get cluster
                    cluster_stmt = select(Cluster).where(Cluster.id == cluster_id)
                    cluster_result = await db.execute(cluster_stmt)
                    cluster = cluster_result.scalar_one_or_none()
                    
                    if not cluster:
                        status.failed_clusters.append(cluster_id)
                        continue
                    
                    try:
                        # Delete existing notes for this cluster first
                        delete_stmt = delete(Note).where(Note.cluster_id == cluster_id)
                        await db.execute(delete_stmt)
                        await db.commit()
                        
                        # Gather source content
                        source_content = []
                        source_mapping = cluster.sources_json.get("source_mapping", [])
                        
                        if source_mapping:
                            for mapping in source_mapping:
                                source_name = mapping.get("source", "")
                                if source_name in documents:
                                    source_content.append(documents[source_name])
                        else:
                            # Use all documents if no mapping
                            source_content = list(documents.values())
                        
                        combined_content = "\n\n".join(source_content)
                        
                        # Get context about other clusters for uniqueness
                        other_clusters = get_other_clusters_context(cluster_id)
                        
                        # Generate note with prompt options and uniqueness context
                        markdown = await note_generation_service.generate_note(
                            topic_title=cluster.title,
                            source_content=combined_content,
                            api_key=api_key,
                            prompt_options=prompt_options,
                            other_topics=other_clusters
                        )
                        
                        # Save note
                        note = Note(
                            cluster_id=cluster_id,
                            markdown_content=markdown,
                            status="generated"
                        )
                        db.add(note)
                        await db.commit()
                        
                        status.completed_clusters.append(cluster_id)
                        
                        # Rate limiting delay between successful generations
                        if rate_limit_enabled and len(status.completed_clusters) < len(cluster_ids):
                            await asyncio.sleep(RATE_LIMIT_DELAY)
                        
                    except Exception as e:
                        status.failed_clusters.append(cluster_id)
                        
                        # Save failed note
                        note = Note(
                            cluster_id=cluster_id,
                            markdown_content=f"# Generation Failed\n\nError: {str(e)}",
                            status="failed"
                        )
                        db.add(note)
                        await db.commit()
                        
                        # Still apply rate limit after failure
                        if rate_limit_enabled:
                            await asyncio.sleep(RATE_LIMIT_DELAY)
                    
                    # Update progress
                    total = len(cluster_ids)
                    done = len(status.completed_clusters) + len(status.failed_clusters)
                    status.progress = done / total
            
            status.status = "completed"
            status.current_cluster = None
            
        except Exception as e:
            status.status = "failed"


@router.post("/", response_model=GenerateResponse)
async def generate_notes(
    request: GenerateRequest,
    background_tasks: BackgroundTasks,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db)
):
    """
    Trigger Cornell note generation for clusters.
    """
    import uuid
    
    # Verify session
    session_stmt = select(Session).where(Session.id == request.session_id)
    session_result = await db.execute(session_stmt)
    session = session_result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get clusters
    if request.cluster_ids:
        cluster_ids = request.cluster_ids
    else:
        cluster_stmt = select(Cluster).where(Cluster.session_id == request.session_id)
        cluster_result = await db.execute(cluster_stmt)
        cluster_ids = [c.id for c in cluster_result.scalars().all()]
    
    if not cluster_ids:
        raise HTTPException(status_code=400, detail="No clusters found for generation")
    
    # Create task
    task_id = str(uuid.uuid4())
    generation_tasks[task_id] = GenerationStatus(
        task_id=task_id,
        status="pending",
        progress=0.0,
        completed_clusters=[],
        failed_clusters=[]
    )
    
    # Queue background task
    # Convert prompt_options to dict for background task
    prompt_opts_dict = None
    if request.prompt_options:
        prompt_opts_dict = {
            "use_default": request.prompt_options.use_default,
            "language": request.prompt_options.language,
            "depth": request.prompt_options.depth,
            "custom_prompt": request.prompt_options.custom_prompt
        }
    
    background_tasks.add_task(
        generate_notes_task,
        task_id,
        cluster_ids,
        api_key,
        request.session_id,
        prompt_opts_dict,
        request.rate_limit_enabled
    )
    
    return GenerateResponse(
        task_id=task_id,
        status="pending",
        message=f"Generation started for {len(cluster_ids)} clusters"
    )


@router.get("/status/{task_id}", response_model=GenerationStatus)
async def get_generation_status(task_id: str):
    """Get the status of a generation task."""
    if task_id not in generation_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return generation_tasks[task_id]


@router.get("/notes/{session_id}", response_model=NoteListResponse)
async def list_notes(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """List all generated notes for a session (one per cluster, latest only)."""
    # Get clusters for session
    cluster_stmt = select(Cluster).where(Cluster.session_id == session_id).order_by(Cluster.order_index)
    cluster_result = await db.execute(cluster_stmt)
    clusters = cluster_result.scalars().all()
    
    if not clusters:
        return NoteListResponse(notes=[], total=0)
    
    # Get latest note for each cluster
    notes = []
    for cluster in clusters:
        note_stmt = select(Note).where(Note.cluster_id == cluster.id).order_by(Note.created_at.desc()).limit(1)
        note_result = await db.execute(note_stmt)
        note = note_result.scalar_one_or_none()
        if note:
            notes.append(note)
    
    return NoteListResponse(
        notes=[
            NoteResponse(
                id=n.id,
                cluster_id=n.cluster_id,
                markdown_content=n.markdown_content,
                status=n.status,
                created_at=n.created_at
            )
            for n in notes
        ],
        total=len(notes)
    )


@router.get("/note/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific note."""
    stmt = select(Note).where(Note.id == note_id)
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    return NoteResponse(
        id=note.id,
        cluster_id=note.cluster_id,
        markdown_content=note.markdown_content,
        status=note.status,
        created_at=note.created_at
    )
