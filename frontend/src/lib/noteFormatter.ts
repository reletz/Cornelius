/**
 * Note formatter service - Fixes and validates Cornell note format.
 * Ensures proper callout syntax and quote marker structure.
 * 
 * This is a TypeScript port of backend/app/services/note_formatter.py
 */

/**
 * Main entry point - fix all formatting issues.
 */
export function formatNote(markdown: string): string {
  // Step 1: Fix callout syntax (remove extra brackets)
  markdown = fixCalloutSyntax(markdown);
  
  // Step 2: Fix cornell section structure
  markdown = fixCornellStructure(markdown);
  
  // Step 3: Fix summary section structure
  markdown = fixSummaryStructure(markdown);
  
  // Step 4: Fix ad-libitum section structure
  markdown = fixAdlibitumStructure(markdown);
  
  // Step 5: Ensure proper spacing between sections
  markdown = fixSectionSpacing(markdown);
  
  // Step 6: Clean up extra whitespace
  markdown = cleanupWhitespace(markdown);
  
  return markdown;
}

/**
 * Fix callout syntax - ensure [!name] not [[!name]] or other variants.
 */
function fixCalloutSyntax(text: string): string {
  // Fix [[!cornell]] -> [!cornell]
  text = text.replace(/\[\[!cornell\]\]/gi, '[!cornell]');
  text = text.replace(/\[\[!summary\]\]/gi, '[!summary]');
  text = text.replace(/\[\[!ad-libitum\]\]/gi, '[!ad-libitum]');
  
  // Fix case normalization
  text = text.replace(/\[!cornell\]/gi, '[!cornell]');
  text = text.replace(/\[!summary\]/gi, '[!summary]');
  text = text.replace(/\[!ad-libitum\]/gi, '[!ad-libitum]');
  
  // Fix variations like [!adlibitum] -> [!ad-libitum]
  text = text.replace(/\[!adlibitum\]/gi, '[!ad-libitum]');
  text = text.replace(/\[!ad_libitum\]/gi, '[!ad-libitum]');
  
  return text;
}

/**
 * Fix cornell callout structure using structure-based detection.
 */
function fixCornellStructure(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inCornell = false;
  const headingLevelSeen: Record<string, boolean> = {};
  let sectionType: 'list_section' | 'concept_section' | null = null;
  let addedConceptSeparator = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    
    // Detect start of cornell callout
    if (stripped.toLowerCase().includes('[!cornell]')) {
      inCornell = true;
      Object.keys(headingLevelSeen).forEach(k => delete headingLevelSeen[k]);
      sectionType = null;
      addedConceptSeparator = false;
      
      // Ensure single > at start
      const cleanLine = line.replace(/^[>\s]*/, '');
      if (cleanLine.toLowerCase().includes('[!cornell]')) {
        result.push('> ' + cleanLine);
      } else {
        result.push(line);
      }
      continue;
    }
    
    // Detect end of cornell (start of summary or ad-libitum)
    if (inCornell && (
      stripped.toLowerCase().includes('[!summary]') || 
      stripped.toLowerCase().includes('[!ad-libitum]')
    )) {
      inCornell = false;
      Object.keys(headingLevelSeen).forEach(k => delete headingLevelSeen[k]);
      sectionType = null;
      addedConceptSeparator = false;
    }
    
    if (inCornell) {
      // Remove existing > markers to normalize
      const content = line.replace(/^[>\s]+/, '').trim();
      
      // Empty line handling
      if (!content) {
        if (sectionType === 'list_section') {
          result.push('> >');
        } else if (sectionType === 'concept_section') {
          // Skip empty lines in concept section
        } else {
          // Separator line (single >) before any section starts
          result.push('>');
        }
        continue;
      }
      
      // Detect headings
      const headingMatch = content.match(/^(#+)\s+(.+)$/);
      if (headingMatch) {
        const headingMarkers = headingMatch[1];
        const headingText = headingMatch[2];
        const headingLevel = headingMarkers.length;
        
        // Determine section type based on heading level
        if (headingLevel === 2) {
          sectionType = 'list_section';
          addedConceptSeparator = false;
          result.push('> > ## ' + headingText);
        } else if (headingLevel >= 3) {
          // Transitioning to concept section
          if (sectionType !== 'concept_section' && !addedConceptSeparator) {
            if (headingLevelSeen['list_section']) {
              result.push('>');
            }
            addedConceptSeparator = true;
          }
          
          sectionType = 'concept_section';
          result.push('> > ### ' + headingText);
        } else {
          // Level 1 heading - treat as cornell title
          result.push('> ' + line);
        }
        
        headingLevelSeen[sectionType || 'other'] = true;
        continue;
      }
      
      // Regular content
      if (sectionType === 'list_section' || sectionType === 'concept_section') {
        result.push('> > ' + content);
      } else {
        result.push('> ' + content);
      }
    } else {
      result.push(line);
    }
  }
  
  return result.join('\n');
}

/**
 * Fix summary callout structure - always single > prefix.
 */
function fixSummaryStructure(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inSummary = false;
  
  for (const line of lines) {
    const stripped = line.trim();
    
    // Detect start of summary
    if (stripped.toLowerCase().includes('[!summary]')) {
      inSummary = true;
      const content = line.replace(/^[>\s]*/, '');
      result.push('> ' + content);
      continue;
    }
    
    // Detect end of summary
    if (inSummary && (
      stripped.toLowerCase().includes('[!cornell]') || 
      stripped.toLowerCase().includes('[!ad-libitum]')
    )) {
      inSummary = false;
    }
    
    if (inSummary) {
      const content = line.replace(/^[>\s]+/, '');
      if (content) {
        result.push('> ' + content);
      } else {
        result.push('>');
      }
    } else {
      result.push(line);
    }
  }
  
  return result.join('\n');
}

/**
 * Fix ad-libitum callout structure - always single > prefix.
 */
function fixAdlibitumStructure(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inAdlibitum = false;
  
  for (const line of lines) {
    const stripped = line.trim();
    
    // Detect start of ad-libitum
    if (stripped.toLowerCase().includes('[!ad-libitum]')) {
      inAdlibitum = true;
      const content = line.replace(/^[>\s]*/, '');
      result.push('> ' + content);
      continue;
    }
    
    // Detect end
    if (inAdlibitum && (
      stripped.toLowerCase().includes('[!cornell]') || 
      stripped.toLowerCase().includes('[!summary]')
    )) {
      inAdlibitum = false;
    }
    
    if (inAdlibitum) {
      const content = line.replace(/^[>\s]+/, '');
      if (content) {
        result.push('> ' + content);
      } else {
        result.push('>');
      }
    } else {
      result.push(line);
    }
  }
  
  return result.join('\n');
}

/**
 * Ensure blank line between sections.
 */
function fixSectionSpacing(text: string): string {
  // Add blank line before [!summary] if not present
  text = text.replace(/(\n>[^\n]*\n)(> \[!summary\])/g, '$1\n$2');
  
  // Add blank line before [!ad-libitum] if not present
  text = text.replace(/(\n>[^\n]*\n)(> \[!ad-libitum\])/g, '$1\n$2');
  
  // Add blank line before [!cornell] if not present
  text = text.replace(/(\n>[^\n]*\n)(> \[!cornell\])/g, '$1\n$2');
  
  return text;
}

/**
 * Clean up excessive whitespace while preserving structure.
 */
function cleanupWhitespace(text: string): string {
  // Remove trailing whitespace from lines
  let lines = text.split('\n').map(line => line.trimEnd());
  
  // Remove excessive blank lines (more than 2 consecutive)
  const result: string[] = [];
  let blankCount = 0;
  
  for (const line of lines) {
    if (!line || line === '>') {
      blankCount++;
      if (blankCount <= 2) {
        result.push(line);
      }
    } else {
      blankCount = 0;
      result.push(line);
    }
  }
  
  return result.join('\n');
}

/**
 * Validate the note format and return issues found.
 */
export function validateFormat(markdown: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check for wrong callout syntax
  if (/\[\[!cornell\]\]/i.test(markdown)) {
    issues.push('Found [[!cornell]] instead of [!cornell]');
  }
  if (/\[\[!summary\]\]/i.test(markdown)) {
    issues.push('Found [[!summary]] instead of [!summary]');
  }
  if (/\[\[!ad-libitum\]\]/i.test(markdown)) {
    issues.push('Found [[!ad-libitum]] instead of [!ad-libitum]');
  }
  
  // Check for required sections
  if (!/\[!cornell\]/i.test(markdown)) {
    issues.push('Missing [!cornell] section');
  }
  if (!/\[!summary\]/i.test(markdown)) {
    issues.push('Missing [!summary] section');
  }
  if (!/\[!ad-libitum\]/i.test(markdown)) {
    issues.push('Missing [!ad-libitum] section');
  }
  
  // Check that cornell section has some structure
  const cornellMatch = markdown.match(/\[!cornell\].*?(?=\[!summary\]|\[!ad-libitum\]|$)/is);
  if (cornellMatch) {
    const cornellText = cornellMatch[0];
    if (!/^>+\s*#{2,}/m.test(cornellText)) {
      issues.push('Cornell section should have subsections (## or ### headings)');
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}
