"""
Note formatter service - Fixes and validates Cornell note format.
Ensures proper callout syntax and quote marker structure.
"""
import re
import logging
from typing import Tuple

logger = logging.getLogger(__name__)


class NoteFormatterService:
    """Post-processes AI-generated notes to ensure correct format."""
    
    def format_note(self, markdown: str) -> str:
        """
        Main entry point - fix all formatting issues.
        
        Args:
            markdown: Raw markdown from AI
            
        Returns:
            Properly formatted markdown
        """
        # Step 1: Fix callout syntax (remove extra brackets)
        markdown = self._fix_callout_syntax(markdown)
        
        # Step 2: Fix cornell section structure
        markdown = self._fix_cornell_structure(markdown)
        
        # Step 3: Fix summary section structure
        markdown = self._fix_summary_structure(markdown)
        
        # Step 4: Fix ad-libitum section structure
        markdown = self._fix_adlibitum_structure(markdown)
        
        # Step 5: Ensure proper spacing between sections
        markdown = self._fix_section_spacing(markdown)
        
        # Step 6: Clean up extra whitespace
        markdown = self._cleanup_whitespace(markdown)
        
        return markdown
    
    def _fix_callout_syntax(self, text: str) -> str:
        """
        Fix callout syntax - ensure [!name] not [[!name]] or other variants.
        """
        # Fix [[!cornell]] -> [!cornell]
        text = re.sub(r'\[\[!cornell\]\]', '[!cornell]', text, flags=re.IGNORECASE)
        text = re.sub(r'\[\[!summary\]\]', '[!summary]', text, flags=re.IGNORECASE)
        text = re.sub(r'\[\[!ad-libitum\]\]', '[!ad-libitum]', text, flags=re.IGNORECASE)
        
        # Fix [!Cornell] -> [!cornell] (case normalization)
        text = re.sub(r'\[!cornell\]', '[!cornell]', text, flags=re.IGNORECASE)
        text = re.sub(r'\[!summary\]', '[!summary]', text, flags=re.IGNORECASE)
        text = re.sub(r'\[!ad-libitum\]', '[!ad-libitum]', text, flags=re.IGNORECASE)
        
        # Fix variations like [!adlibitum] -> [!ad-libitum]
        text = re.sub(r'\[!adlibitum\]', '[!ad-libitum]', text, flags=re.IGNORECASE)
        text = re.sub(r'\[!ad_libitum\]', '[!ad-libitum]', text, flags=re.IGNORECASE)
        
        return text
    
    def _fix_cornell_structure(self, text: str) -> str:
        """
        Fix cornell callout structure using structure-based detection.
        
        More robust approach: detect sections by heading level and context,
        not by exact keyword matching. This works regardless of language
        or how AI names the sections.
        
        Expected format:
        > [!cornell] Title
        >
        > > ## [Any heading - treated as Questions/Cues section]
        > > - content
        > >
        > > ## [Any heading - treated as Reference Points section]
        > > - content
        >
        > > ### [Any heading - treated as Major Concepts]
        > > content
        > >
        > > ### [Any heading - treated as Major Concepts]
        > > content
        """
        lines = text.split('\n')
        result = []
        in_cornell = False
        heading_level_seen = {}  # Track heading levels seen within cornell
        section_type = None  # 'list_section' or 'concept_section'
        added_concept_separator = False  # Track if we already added separator before concepts
        
        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            
            # Detect start of cornell callout
            if '[!cornell]' in stripped.lower():
                in_cornell = True
                heading_level_seen = {}
                section_type = None
                added_concept_separator = False
                # Ensure single > at start
                clean_line = re.sub(r'^[>\s]*', '', line)
                if '[!cornell]' in clean_line.lower():
                    result.append('> ' + clean_line)
                else:
                    result.append(line)
                i += 1
                continue
            
            # Detect end of cornell (start of summary or ad-libitum)
            if in_cornell and ('[!summary]' in stripped.lower() or '[!ad-libitum]' in stripped.lower()):
                in_cornell = False
                heading_level_seen = {}
                section_type = None
                added_concept_separator = False
            
            if in_cornell:
                # Remove existing > markers to normalize
                content = re.sub(r'^[>\s]+', '', line).strip()
                
                # Empty line handling
                if not content:
                    if section_type == 'list_section':
                        result.append('> >')
                    elif section_type == 'concept_section':
                        # Skip empty lines in concept section (no gap between concepts)
                        pass
                    else:
                        # Separator line (single >) before any section starts
                        result.append('>')
                    i += 1
                    continue
                
                # Detect headings
                heading_match = re.match(r'^(#+)\s+(.+)$', content)
                if heading_match:
                    heading_markers = heading_match.group(1)
                    heading_text = heading_match.group(2)
                    heading_level = len(heading_markers)
                    
                    # Determine section type based on heading level
                    # Level 2 (##) = list sections (Questions/Cues, Reference Points, etc)
                    # Level 3+ (### or more) = concept sections
                    if heading_level == 2:
                        section_type = 'list_section'
                        added_concept_separator = False  # Reset separator flag
                        result.append('> > ## ' + heading_text)
                    elif heading_level >= 3:
                        # Transitioning to concept section
                        if section_type != 'concept_section' and not added_concept_separator:
                            # Only add separator ONCE when first entering concept_section
                            if 'list_section' in heading_level_seen:
                                result.append('>')
                            added_concept_separator = True
                        
                        section_type = 'concept_section'
                        result.append('> > ### ' + heading_text)
                    else:
                        # Level 1 heading - treat as cornell title
                        result.append('> ' + line)
                    
                    heading_level_seen[section_type or 'other'] = True
                    i += 1
                    continue
                
                # Regular content
                if section_type == 'list_section' or section_type == 'concept_section':
                    # Double > for content in list and concept sections
                    result.append('> > ' + content)
                else:
                    # Single > for other cornell content
                    result.append('> ' + content)
            else:
                result.append(line)
            
            i += 1
        
        return '\n'.join(result)
    
    def _fix_summary_structure(self, text: str) -> str:
        """
        Fix summary callout structure - always single > prefix.
        
        Expected format:
        > [!summary]
        > 
        > Content here with single >
        """
        lines = text.split('\n')
        result = []
        in_summary = False
        
        for line in lines:
            stripped = line.strip()
            
            # Detect start of summary
            if '[!summary]' in stripped.lower():
                in_summary = True
                # Ensure proper format
                content = re.sub(r'^[>\s]*', '', line)
                result.append('> ' + content)
                continue
            
            # Detect end of summary (start of another section)
            if in_summary and ('[!cornell]' in stripped.lower() or '[!ad-libitum]' in stripped.lower()):
                in_summary = False
            
            if in_summary:
                # Normalize to single >
                content = re.sub(r'^[>\s]+', '', line)
                if content:
                    result.append('> ' + content)
                else:
                    result.append('>')
            else:
                result.append(line)
        
        return '\n'.join(result)
    
    def _fix_adlibitum_structure(self, text: str) -> str:
        """
        Fix ad-libitum callout structure - always single > prefix.
        
        Expected format:
        > [!ad-libitum]- Additional Information
        > 
        > Content here with single >
        """
        lines = text.split('\n')
        result = []
        in_adlibitum = False
        
        for line in lines:
            stripped = line.strip()
            
            # Detect start of ad-libitum
            if '[!ad-libitum]' in stripped.lower():
                in_adlibitum = True
                # Ensure proper format
                content = re.sub(r'^[>\s]*', '', line)
                result.append('> ' + content)
                continue
            
            # Detect end (start of another section or end of file)
            if in_adlibitum and ('[!cornell]' in stripped.lower() or '[!summary]' in stripped.lower()):
                in_adlibitum = False
            
            if in_adlibitum:
                # Normalize to single >
                content = re.sub(r'^[>\s]+', '', line)
                if content:
                    result.append('> ' + content)
                else:
                    result.append('>')
            else:
                result.append(line)
        
        return '\n'.join(result)
    
    def _fix_section_spacing(self, text: str) -> str:
        """
        Ensure blank line between [!cornell], [!summary], and [!ad-libitum] sections.
        """
        # Add blank line before [!summary] if not present
        text = re.sub(r'(\n>[^\n]*\n)(> \[!summary\])', r'\1\n\2', text)
        
        # Add blank line before [!ad-libitum] if not present  
        text = re.sub(r'(\n>[^\n]*\n)(> \[!ad-libitum\])', r'\1\n\2', text)
        
        # Add blank line before [!cornell] if not present (for multiple cornell sections)
        text = re.sub(r'(\n>[^\n]*\n)(> \[!cornell\])', r'\1\n\2', text)
        
        return text
    
    def _cleanup_whitespace(self, text: str) -> str:
        """
        Clean up excessive whitespace while preserving structure.
        """
        # Remove trailing whitespace from lines
        lines = [line.rstrip() for line in text.split('\n')]
        
        # Remove excessive blank lines (more than 2 consecutive)
        result = []
        blank_count = 0
        for line in lines:
            if not line or line == '>':
                blank_count += 1
                if blank_count <= 2:
                    result.append(line)
            else:
                blank_count = 0
                result.append(line)
        
        return '\n'.join(result)
    
    def validate_format(self, markdown: str) -> Tuple[bool, list]:
        """
        Validate the note format and return issues found.
        
        More lenient validation - focuses on critical structure,
        not exact naming of sections (which may be translated).
        
        Returns:
            Tuple of (is_valid, list of issues)
        """
        issues = []
        
        # Check for wrong callout syntax
        if re.search(r'\[\[!cornell\]\]', markdown, re.IGNORECASE):
            issues.append("Found [[!cornell]] instead of [!cornell]")
        if re.search(r'\[\[!summary\]\]', markdown, re.IGNORECASE):
            issues.append("Found [[!summary]] instead of [!summary]")
        if re.search(r'\[\[!ad-libitum\]\]', markdown, re.IGNORECASE):
            issues.append("Found [[!ad-libitum]] instead of [!ad-libitum]")
        
        # Check for required sections (but don't validate their names)
        if not re.search(r'\[!cornell\]', markdown, re.IGNORECASE):
            issues.append("Missing [!cornell] section")
        if not re.search(r'\[!summary\]', markdown, re.IGNORECASE):
            issues.append("Missing [!summary] section")
        if not re.search(r'\[!ad-libitum\]', markdown, re.IGNORECASE):
            issues.append("Missing [!ad-libitum] section")
        
        # Check that cornell section has some structure (at least one heading)
        cornell_section = re.search(
            r'\[!cornell\].*?(?=\[!summary\]|\[!ad-libitum\]|$)',
            markdown,
            re.IGNORECASE | re.DOTALL
        )
        if cornell_section:
            cornell_text = cornell_section.group(0)
            # Should have at least one ## or ### heading
            if not re.search(r'^>+\s*#{2,}', cornell_text, re.MULTILINE):
                issues.append("Cornell section should have subsections (## or ### headings)")
        
        return len(issues) == 0, issues


# Singleton instance
note_formatter_service = NoteFormatterService()