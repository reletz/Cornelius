"""
Note generation service - Cornell notes using OpenRouter LLM.
"""
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
from openai import AsyncOpenAI

from app.services.note_formatter import note_formatter_service

logger = logging.getLogger(__name__)

# OpenRouter configuration
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
NOTE_GENERATION_MODEL = "tngtech/deepseek-r1t2-chimera:free"

# Prompt paths
PROMPT_DIR = Path(__file__).parent.parent / "prompt"
DEFAULT_PROMPT_DIR = PROMPT_DIR / "default"


def _load_prompt(filepath: Path) -> str:
    """Load prompt from file."""
    return filepath.read_text(encoding="utf-8")


# Load base prompt
BASE_PROMPT = _load_prompt(DEFAULT_PROMPT_DIR / "note-gen.md")

# Load modifiers (lazy load to handle missing files gracefully)
MODIFIERS: Dict[str, str] = {}


def _get_modifier(language: str, depth: str) -> str:
    """Get the modifier prompt for given language and depth."""
    key = f"{language}-{depth}"
    if key not in MODIFIERS:
        modifier_path = DEFAULT_PROMPT_DIR / f"modifier-{key}.md"
        if modifier_path.exists():
            MODIFIERS[key] = _load_prompt(modifier_path)
        else:
            logger.warning(f"Modifier not found: {modifier_path}")
            MODIFIERS[key] = ""
    return MODIFIERS[key]


class NoteGenerationService:
    """Handles Cornell note generation using OpenRouter LLM."""
    
    async def generate_note(
        self,
        topic_title: str,
        source_content: str,
        api_key: str,
        model_name: str = NOTE_GENERATION_MODEL,
        prompt_options: Optional[Dict[str, Any]] = None,
        other_topics: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Generate Cornell notes for a topic.
        
        Args:
            topic_title: Title of the topic/cluster
            source_content: Extracted text content
            api_key: OpenRouter API key
            model_name: Which model to use
            prompt_options: Dict with keys:
                - use_default: bool (True = default prompt, False = custom)
                - language: "en" or "id"
                - depth: "concise", "balanced", or "indepth"
                - custom_prompt: str (used when use_default=False)
            other_topics: List of other topics being generated (for uniqueness)
            
        Returns:
            Generated markdown content
        """
        # Configure OpenRouter client
        client = AsyncOpenAI(
            base_url=OPENROUTER_BASE_URL,
            api_key=api_key,
        )
        
        # Build uniqueness context
        uniqueness_context = ""
        if other_topics and len(other_topics) > 0:
            uniqueness_context = self._build_uniqueness_context(other_topics)
        
        # Determine if using default or custom prompt
        use_default = True
        use_formatter = True
        
        if prompt_options:
            use_default = prompt_options.get("use_default", True)
        
        if use_default:
            # Build prompt from base + modifier
            language = prompt_options.get("language", "en") if prompt_options else "en"
            depth = prompt_options.get("depth", "balanced") if prompt_options else "balanced"
            
            modifier = _get_modifier(language, depth)
            
            prompt = f"""{BASE_PROMPT}

{modifier}

{uniqueness_context}

---

## Generate Notes for This Topic

**Topic Title:** {topic_title}

**Source Materials:**

{source_content[:30000]}
"""
        else:
            # Use custom prompt
            custom_prompt = prompt_options.get("custom_prompt", "") if prompt_options else ""
            use_formatter = False  # Don't apply formatter for custom prompts
            
            prompt = f"""{custom_prompt}

{uniqueness_context}

---

## Generate Notes for This Topic

**Topic Title:** {topic_title}

**Source Materials:**

{source_content[:30000]}
"""
        
        try:
            response = await client.chat.completions.create(
                model=model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=8192,
            )
            
            raw_content = response.choices[0].message.content
            cleaned = self._clean_response(raw_content)
            
            # Only apply formatter for default prompts
            if use_formatter:
                formatted = note_formatter_service.format_note(cleaned)
                
                # Log validation results
                is_valid, issues = note_formatter_service.validate_format(formatted)
                if not is_valid:
                    logger.warning(f"Format issues in '{topic_title}': {issues}")
                
                return formatted
            else:
                return cleaned
            
        except Exception as e:
            logger.error(f"Note generation failed for '{topic_title}': {e}")
            raise
    
    def _clean_response(self, text: str) -> str:
        """Clean up generated markdown."""
        # Remove any wrapping code blocks if present
        text = text.strip()
        if text.startswith("```markdown"):
            text = text[11:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()
    
    def _build_uniqueness_context(self, other_topics: List[Dict[str, Any]]) -> str:
        """Build context section to ensure topic uniqueness."""
        if not other_topics:
            return ""
        
        lines = [
            "## IMPORTANT: Topic Uniqueness Requirement",
            "",
            "This note is part of a set. Other notes in this set cover the following topics.",
            "**DO NOT repeat or overlap with these topics. Focus ONLY on your assigned topic.**",
            ""
        ]
        
        for i, topic in enumerate(other_topics, 1):
            title = topic.get("title", "Unknown")
            keywords = topic.get("keywords", [])
            summary = topic.get("summary", "")
            
            lines.append(f"### Other Note {i}: {title}")
            if keywords:
                lines.append(f"- Keywords: {', '.join(keywords[:5])}")
            if summary:
                lines.append(f"- Covers: {summary[:200]}")
            lines.append("")
        
        lines.append("**Your note must NOT include content that belongs to the above topics.**")
        lines.append("")
        
        return "\n".join(lines)


# Singleton instance
note_generation_service = NoteGenerationService()
