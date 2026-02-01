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
 * 
 * Format rules:
 * 1. After [!cornell] callout: single > spacer
 * 2. ## sections (Questions/Cues, Reference): > > prefix, with > > spacer between blocks
 * 3. After ## sections, before ### concepts: single > spacer
 * 4. ### concepts and content: > > prefix
 * 5. Spacing within content:
 *    - Text after heading → > > spacer
 *    - List after heading → > > spacer  
 *    - Text after list → > > spacer
 *    - List after text → > > spacer
 *    - List item to list item → NO spacer
 */
function fixCornellStructure(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inCornell = false;
  let sectionType: 'none' | 'list_section' | 'concept_section' = 'none';
  let lastLineType: 'callout' | 'heading' | 'list' | 'text' = 'callout';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    
    // Detect start of cornell callout
    if (stripped.toLowerCase().includes('[!cornell]')) {
      inCornell = true;
      sectionType = 'none';
      lastLineType = 'callout';
      
      // Ensure single > at start
      const cleanLine = stripped.replace(/^[>\s]*/, '');
      result.push('> ' + cleanLine);
      continue;
    }
    
    // Detect end of cornell (start of summary or ad-libitum)
    if (inCornell && (
      stripped.toLowerCase().includes('[!summary]') || 
      stripped.toLowerCase().includes('[!ad-libitum]')
    )) {
      inCornell = false;
      sectionType = 'none';
      lastLineType = 'callout';
    }
    
    if (inCornell) {
      // Remove existing > markers to normalize
      const content = line.replace(/^[>\s]+/, '').trim();
      
      // Skip empty lines - we'll add spacing ourselves
      if (!content) {
        continue;
      }
      
      // Detect content type
      const headingMatch = content.match(/^(#+)\s+(.+)$/);
      const isList = /^[-*]\s+/.test(content) || /^\d+\.\s+/.test(content);
      
      if (headingMatch) {
        const headingLevel = headingMatch[1].length;
        const headingText = headingMatch[2];
        
        if (headingLevel === 2) {
          // ## heading (Questions/Cues, Reference Points)
          // Add spacer before if not first item after callout
          if (lastLineType === 'callout') {
            // Single > spacer after callout
            result.push('>');
          } else if (lastLineType === 'heading' || lastLineType === 'list' || lastLineType === 'text') {
            result.push('> >');
          }
          
          sectionType = 'list_section';
          result.push('> > ## ' + headingText);
          lastLineType = 'heading';
        } else if (headingLevel >= 3) {
          // ### heading (concepts)
          // Transition from list_section to concept_section needs single > spacer
          if (sectionType === 'list_section') {
            result.push('>');
            sectionType = 'concept_section';
          } else if (lastLineType === 'callout') {
            // No list section, single > after callout
            result.push('>');
          } else if (lastLineType === 'heading' || lastLineType === 'list' || lastLineType === 'text') {
            // Add > > spacer before heading in concept section
            result.push('> >');
          }
          
          sectionType = 'concept_section';
          result.push('> > ### ' + headingText);
          lastLineType = 'heading';
        }
        continue;
      }
      
      // List items
      if (isList) {
        // Add spacer before list if coming from text or heading
        if (lastLineType === 'text' || lastLineType === 'heading') {
          result.push('> >');
        }
        
        result.push('> > ' + content);
        lastLineType = 'list';
        continue;
      }
      
      // Regular text
      // Add spacer before text if coming from heading or list
      if (lastLineType === 'heading' || lastLineType === 'list') {
        result.push('> >');
      }
      
      result.push('> > ' + content);
      lastLineType = 'text';
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
