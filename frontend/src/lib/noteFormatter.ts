/**
 * Note formatter service - Fixes and validates Cornell note format.
 * Ensures proper callout syntax and quote marker structure.
 * 
 * Expected output format:
 * 
 * > [!cornell] Judul
 * >
 * > > ## Questions/Cues
 * > > - q1
 * > > - q2
 * > >
 * > > ## Reference Points
 * > > - r1
 * > > - r2
 * >
 * > > ### Concept 1
 * > >
 * > > Text here
 * 
 * > [!cornell] #### Summary
 * >
 * > Summary content
 * 
 * > [!ad-libitum]- Additional Notes
 * >
 * > Ad libitum content here
 */

/**
 * Main entry point - fix all formatting issues.
 */
export function formatNote(markdown: string): string {
  // Step 1: Fix callout syntax (remove extra brackets)
  markdown = fixCalloutSyntax(markdown);
  
  // Step 2: Fix all section structures
  markdown = fixAllStructures(markdown);
  
  // Step 3: Clean up extra whitespace
  markdown = cleanupWhitespace(markdown);
  
  return markdown;
}

/**
 * Fix callout syntax - ensure proper format.
 */
function fixCalloutSyntax(text: string): string {
  // Fix [[!cornell]] -> [!cornell]
  text = text.replace(/\[\[!cornell\]\]/gi, '[!cornell]');
  text = text.replace(/\[\[!ad-libitum\]\]/gi, '[!ad-libitum]');
  
  // Fix case normalization
  text = text.replace(/\[!cornell\]/gi, '[!cornell]');
  text = text.replace(/\[!ad-libitum\]/gi, '[!ad-libitum]');
  
  // Fix variations
  text = text.replace(/\[!adlibitum\]/gi, '[!ad-libitum]');
  text = text.replace(/\[!ad_libitum\]/gi, '[!ad-libitum]');
  
  return text;
}

type SectionType = 'none' | 'cornell_main' | 'cornell_summary' | 'ad_libitum';
type SubSectionType = 'none' | 'h2_section' | 'concept_section';
type LastLineType = 'callout' | 'heading' | 'list' | 'text';

/**
 * Fix all callout structures in one pass.
 */
function fixAllStructures(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  
  let currentSection: SectionType = 'none';
  let subSection: SubSectionType = 'none';
  let lastLineType: LastLineType = 'callout';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    const content = line.replace(/^[>\s]+/, '').trim();
    
    // Detect [!cornell] #### Summary
    if (stripped.toLowerCase().includes('[!cornell]') && 
        stripped.toLowerCase().includes('summary')) {
      // Add empty line before if previous section exists
      if (currentSection !== 'none' && result.length > 0) {
        result.push('');
      }
      
      currentSection = 'cornell_summary';
      subSection = 'none';
      lastLineType = 'callout';
      result.push('> [!cornell] #### Summary');
      continue;
    }
    
    // Detect [!cornell] (main, not summary)
    if (stripped.toLowerCase().includes('[!cornell]')) {
      // Add empty line before if previous section exists
      if (currentSection !== 'none' && result.length > 0) {
        result.push('');
      }
      
      currentSection = 'cornell_main';
      subSection = 'none';
      lastLineType = 'callout';
      
      // Extract title
      const titleMatch = content.match(/\[!cornell\]\s*(.*)/i);
      const title = titleMatch ? titleMatch[1] : '';
      result.push('> [!cornell] ' + title);
      continue;
    }
    
    // Detect [!ad-libitum]
    if (stripped.toLowerCase().includes('[!ad-libitum]')) {
      // Add empty line before if previous section exists
      if (currentSection !== 'none' && result.length > 0) {
        result.push('');
      }
      
      currentSection = 'ad_libitum';
      subSection = 'none';
      lastLineType = 'callout';
      
      // Extract title (handle both [!ad-libitum] and [!ad-libitum]-)
      const titleMatch = content.match(/\[!ad-libitum\]-?\s*(.*)/i);
      const title = titleMatch ? titleMatch[1] : '';
      result.push('> [!ad-libitum]- ' + title);
      continue;
    }
    
    // Handle content based on current section
    if (currentSection === 'cornell_main') {
      // Empty line - skip, we add spacing ourselves
      if (!content) {
        continue;
      }
      
      const headingMatch = content.match(/^(#+)\s+(.+)$/);
      const isList = /^[-*]\s+/.test(content) || /^\d+\.\s+/.test(content);
      
      if (headingMatch) {
        const headingLevel = headingMatch[1].length;
        const headingText = headingMatch[2];
        
        if (headingLevel === 2) {
          // ## heading (Questions/Cues, Reference Points)
          if (lastLineType === 'callout') {
            result.push('>');
          } else if (subSection === 'h2_section') {
            result.push('> >');
          } else if (subSection === 'concept_section') {
            result.push('>');
          }
          
          subSection = 'h2_section';
          result.push('> > ## ' + headingText);
          lastLineType = 'heading';
        } else if (headingLevel >= 3) {
          // ### heading (concepts)
          if (subSection === 'h2_section') {
            result.push('>');
          } else if (lastLineType === 'callout') {
            result.push('>');
          } else if (subSection === 'concept_section') {
            result.push('> >');
          }
          
          subSection = 'concept_section';
          result.push('> > ### ' + headingText);
          lastLineType = 'heading';
        }
        continue;
      }
      
      // List items
      if (isList) {
        if (lastLineType === 'heading' || lastLineType === 'text') {
          result.push('> >');
        }
        // List to list: no spacer
        result.push('> > ' + content);
        lastLineType = 'list';
        continue;
      }
      
      // Regular text
      if (lastLineType === 'heading' || lastLineType === 'list') {
        result.push('> >');
      }
      result.push('> > ' + content);
      lastLineType = 'text';
      
    } else if (currentSection === 'cornell_summary' || currentSection === 'ad_libitum') {
      // Single > prefix for summary and ad-libitum
      
      if (!content) {
        continue;
      }
      
      const isList = /^[-*]\s+/.test(content) || /^\d+\.\s+/.test(content);
      
      if (lastLineType === 'callout' || lastLineType === 'heading') {
        result.push('>');
      } else if (lastLineType === 'list' && !isList) {
        result.push('>');
      } else if (lastLineType === 'text' && isList) {
        result.push('>');
      }
      // List to list: no spacer
      
      result.push('> ' + content);
      lastLineType = isList ? 'list' : 'text';
      
    } else {
      // Outside any callout
      result.push(line);
    }
  }
  
  return result.join('\n');
}

/**
 * Clean up excessive whitespace while preserving structure.
 */
function cleanupWhitespace(text: string): string {
  const lines = text.split('\n').map(line => line.trimEnd());
  
  // Remove excessive blank lines (more than 1 consecutive between sections)
  const result: string[] = [];
  let blankCount = 0;
  
  for (const line of lines) {
    if (!line) {
      blankCount++;
      if (blankCount <= 1) {
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
  if (/\[\[!ad-libitum\]\]/i.test(markdown)) {
    issues.push('Found [[!ad-libitum]] instead of [!ad-libitum]');
  }
  
  // Check for required sections
  if (!/\[!cornell\]/i.test(markdown)) {
    issues.push('Missing [!cornell] section');
  }
  if (!/\[!ad-libitum\]/i.test(markdown)) {
    issues.push('Missing [!ad-libitum] section');
  }
  
  // Check that cornell section has some structure
  const cornellMatch = markdown.match(/\[!cornell\](?!.*summary)[\s\S]*?(?=\[!cornell\]|\[!ad-libitum\]|$)/i);
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
