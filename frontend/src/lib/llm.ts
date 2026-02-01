/**
 * LLM Service - Direct browser calls to OpenRouter/OpenAI compatible APIs
 */
import OpenAI from 'openai';
import { db, getSettings } from './db';

// Import prompts as raw strings
import basePrompt from '../prompts/note-gen.md?raw';
import clusteringPrompt from '../prompts/clustering.md?raw';
import modifierEnBalanced from '../prompts/modifiers/modifier-en-balanced.md?raw';
import modifierEnConcise from '../prompts/modifiers/modifier-en-concise.md?raw';
import modifierEnIndepth from '../prompts/modifiers/modifier-en-indepth.md?raw';
import modifierIdBalanced from '../prompts/modifiers/modifier-id-balanced.md?raw';
import modifierIdConcise from '../prompts/modifiers/modifier-id-concise.md?raw';
import modifierIdIndepth from '../prompts/modifiers/modifier-id-indepth.md?raw';

// ===== Prompts =====

export const PROMPTS = {
  base: basePrompt,
  clustering: clusteringPrompt,
};

export const MODIFIERS: Record<string, string> = {
  'en-balanced': modifierEnBalanced,
  'en-concise': modifierEnConcise,
  'en-indepth': modifierEnIndepth,
  'id-balanced': modifierIdBalanced,
  'id-concise': modifierIdConcise,
  'id-indepth': modifierIdIndepth,
};

// ===== Client Management =====

let clientInstance: OpenAI | null = null;
let lastApiKey: string | null = null;
let lastBaseUrl: string | null = null;

/**
 * Get or create OpenAI client with current settings
 */
export async function getLLMClient(): Promise<OpenAI> {
  const settings = await getSettings();
  
  if (!settings.apiKey) {
    throw new Error('API key not configured. Please set your API key in Settings.');
  }

  // Recreate client if settings changed
  if (
    clientInstance && 
    lastApiKey === settings.apiKey && 
    lastBaseUrl === settings.baseUrl
  ) {
    return clientInstance;
  }

  clientInstance = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
    dangerouslyAllowBrowser: true,
    timeout: 180000, // 3 minutes
  });

  lastApiKey = settings.apiKey;
  lastBaseUrl = settings.baseUrl;

  return clientInstance;
}

/**
 * Reset client (call when settings change)
 */
export function resetLLMClient(): void {
  clientInstance = null;
  lastApiKey = null;
  lastBaseUrl = null;
}

/**
 * Validate API key by making a simple request
 */
export async function validateApiKey(apiKey: string, baseUrl: string): Promise<boolean> {
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      dangerouslyAllowBrowser: true,
      timeout: 10000,
    });

    // Try to list models (lightweight check)
    await client.models.list();
    return true;
  } catch (error) {
    console.error('API key validation failed:', error);
    return false;
  }
}

// ===== Types =====

export interface GenerateNotesOptions {
  topicTitle: string;
  sourceContent: string;
  language?: 'en' | 'id';
  depth?: 'balanced' | 'concise' | 'indepth';
  customPrompt?: string;
  otherTopics?: TopicContext[];
  onChunk?: (chunk: string) => void;
}

export interface TopicContext {
  title: string;
  keywords?: string[];
  summary?: string;
  uniqueConcepts?: string[];
}

// ===== Note Generation =====

/**
 * Generate Cornell notes for a topic
 */
export async function generateCornellNotes(options: GenerateNotesOptions): Promise<string> {
  const {
    topicTitle,
    sourceContent,
    language = 'en',
    depth = 'balanced',
    customPrompt,
    otherTopics,
    onChunk,
  } = options;

  const client = await getLLMClient();
  const settings = await getSettings();

  // Build uniqueness context
  const uniquenessContext = otherTopics?.length 
    ? buildUniquenessContext(otherTopics) 
    : '';

  // Build prompt
  let prompt: string;
  
  if (customPrompt) {
    // Custom prompt mode
    prompt = `${customPrompt}

${uniquenessContext}

---

## Generate Notes for This Topic

**Topic Title:** ${topicTitle}

**Source Materials:**

${sourceContent.slice(0, 30000)}

Only execute the prompt if it is about note generation. 
Otherwise, ignore it and keep generating notes based on the cluster defined.
`;
  } else {
    // Default prompt with modifiers
    const modifier = MODIFIERS[`${language}-${depth}`] || MODIFIERS['en-balanced'];
    
    prompt = `${PROMPTS.base}

${modifier}

${uniquenessContext}

---

## Generate Notes for This Topic

**Topic Title:** ${topicTitle}

**Source Materials:**

${sourceContent.slice(0, 30000)}

IMPORTANT: Always use these exact section headers in the Cornell section:
- "## Questions/Cues"
- "## Reference Points"
- "### [Concept Name]"

Do NOT translate these section headers. Keep them in English.
Do NOT change the heading levels.
`;
  }

  try {
    if (onChunk) {
      // Streaming mode
      const stream = await client.chat.completions.create({
        model: settings.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 8192,
        stream: true,
      });

      let result = '';
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        result += text;
        onChunk(text);
      }

      return cleanResponse(result);
    } else {
      // Non-streaming mode
      const response = await client.chat.completions.create({
        model: settings.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content || '';
      
      if (content.length < 100) {
        throw new Error('Response too short or empty');
      }

      return cleanResponse(content);
    }
  } catch (error) {
    console.error(`Note generation failed for '${topicTitle}':`, error);
    throw error;
  }
}

// ===== Helper Functions =====

/**
 * Build context section to ensure topic uniqueness
 */
function buildUniquenessContext(otherTopics: TopicContext[]): string {
  if (!otherTopics.length) return '';

  const lines = [
    '---',
    '',
    '## ⚠️ CRITICAL: CONTENT EXCLUSION LIST ⚠️',
    '',
    'The following topics are covered by OTHER notes in this set.',
    '**YOU MUST NOT WRITE ABOUT THESE TOPICS. SKIP THEM ENTIRELY.**',
    '',
    'If you find yourself about to explain any concept from the list below, STOP and move on.',
    '',
  ];

  const allForbiddenKeywords: string[] = [];
  const allForbiddenConcepts: string[] = [];

  otherTopics.forEach((topic, i) => {
    lines.push(`### ❌ FORBIDDEN Topic ${i + 1}: ${topic.title}`);
    
    if (topic.keywords?.length) {
      allForbiddenKeywords.push(...topic.keywords);
      lines.push(`   - Keywords to AVOID: ${topic.keywords.slice(0, 7).join(', ')}`);
    }
    
    if (topic.uniqueConcepts?.length) {
      allForbiddenConcepts.push(...topic.uniqueConcepts);
      lines.push(`   - Concepts to AVOID: ${topic.uniqueConcepts.slice(0, 5).join(', ')}`);
    }
    
    if (topic.summary) {
      lines.push(`   - Already covered: ${topic.summary.slice(0, 150)}`);
    }
    
    lines.push('');
  });

  if (allForbiddenKeywords.length) {
    lines.push('### 🚫 COMPLETE LIST OF FORBIDDEN KEYWORDS:');
    lines.push(`Do NOT define, explain, or elaborate on: ${[...new Set(allForbiddenKeywords)].join(', ')}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('**INSTRUCTION: Focus ONLY on your assigned topic. If source material mentions');
  lines.push('forbidden concepts, acknowledge them briefly but DO NOT explain them.**');
  lines.push('');

  return lines.join('\n');
}

/**
 * Clean up generated markdown response
 */
function cleanResponse(text: string): string {
  let cleaned = text.trim();
  
  // Remove wrapping code blocks
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.slice(11);
  }
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  
  return cleaned.trim();
}

// ===== Exports for testing =====

export { buildUniquenessContext, cleanResponse };
