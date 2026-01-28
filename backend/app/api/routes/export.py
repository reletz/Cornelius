"""
Export routes - PDF and Markdown download.
"""
import io
import zipfile
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Session, Cluster, Note
from app.services.pdf_generator import pdf_service

router = APIRouter()


@router.get("/{session_id}/markdown")
async def export_markdown(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Export notes as markdown.
    - Single note: Direct .md file download
    - Multiple notes: ZIP file containing markdown files
    """
    # Verify session
    session_stmt = select(Session).where(Session.id == session_id)
    session_result = await db.execute(session_stmt)
    session = session_result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get clusters and notes
    cluster_stmt = select(Cluster).where(Cluster.session_id == session_id).order_by(Cluster.order_index)
    cluster_result = await db.execute(cluster_stmt)
    clusters = cluster_result.scalars().all()
    
    if not clusters:
        raise HTTPException(status_code=400, detail="No clusters found")
    
    # Collect all notes with their titles
    notes_data = []
    for cluster in clusters:
        note_stmt = select(Note).where(Note.cluster_id == cluster.id).order_by(Note.created_at.desc()).limit(1)
        note_result = await db.execute(note_stmt)
        note = note_result.scalar_one_or_none()
        
        if note and note.markdown_content:
            safe_title = "".join(c for c in cluster.title if c.isalnum() or c in (' ', '-', '_')).rstrip()
            notes_data.append({
                "title": safe_title,
                "content": note.markdown_content
            })
    
    if not notes_data:
        raise HTTPException(status_code=400, detail="No notes found")
    
    # Single note: return direct .md file
    if len(notes_data) == 1:
        note = notes_data[0]
        return Response(
            content=note["content"],
            media_type="text/markdown",
            headers={
                "Content-Disposition": f"attachment; filename={note['title']}.md"
            }
        )
    
    # Multiple notes: return ZIP file
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for note in notes_data:
            filename = f"{note['title']}.md"
            zip_file.writestr(filename, note["content"])
    
    zip_buffer.seek(0)
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=cornell-notes-{session_id[:8]}.zip"
        }
    )


@router.get("/{session_id}/pdf")
async def export_pdf(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Export all notes as a single PDF file.
    Uses WeasyPrint for rendering.
    """
    # Verify session
    session_stmt = select(Session).where(Session.id == session_id)
    session_result = await db.execute(session_stmt)
    session = session_result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get clusters and notes
    cluster_stmt = select(Cluster).where(Cluster.session_id == session_id).order_by(Cluster.order_index)
    cluster_result = await db.execute(cluster_stmt)
    clusters = cluster_result.scalars().all()
    
    if not clusters:
        raise HTTPException(status_code=400, detail="No clusters found")
    
    # Collect all notes content
    notes_content = []
    for cluster in clusters:
        note_stmt = select(Note).where(Note.cluster_id == cluster.id).order_by(Note.created_at.desc()).limit(1)
        note_result = await db.execute(note_stmt)
        note = note_result.scalar_one_or_none()
        
        if note and note.markdown_content:
            notes_content.append(note.markdown_content)
    
    if not notes_content:
        raise HTTPException(status_code=400, detail="No notes found")
    
    # Generate PDF
    pdf_bytes = pdf_service.generate_combined_pdf(notes_content)
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=cornell-notes-{session_id[:8]}.pdf"
        }
    )


@router.get("/note/{note_id}/pdf")
async def export_single_note_pdf(
    note_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Export a single note as PDF."""
    note_stmt = select(Note).where(Note.id == note_id)
    note_result = await db.execute(note_stmt)
    note = note_result.scalar_one_or_none()
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    pdf_bytes = pdf_service.generate_pdf(note.markdown_content)
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=note-{note_id[:8]}.pdf"
        }
    )
