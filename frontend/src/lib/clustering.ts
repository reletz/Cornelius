/**
 * Clustering Service - Analyze documents and create topic clusters
 */
import { getLLMClient, PROMPTS } from './llm';
import { getSettings, Document } from './db';

// ===== Types =====

export interface ClusterSourceMapping {
  source: string;
  slides?: number[];
}

export interface ClusterResult {
  id: string;
  title: string;
  keywords: string[];
  sourceMapping: ClusterSourceMapping[];
  summary: string;
  estimatedWordCount: number;
  uniqueConcepts: string[];
}

export interface ClusteringResponse {
  clusters: ClusterResult[];
  totalClusters: number;
  uniquenessVerification: string;
}

// ===== Clustering Functions =====

/**
 * Analyze documents and generate topic clusters
 */
export async function analyzeAndCluster(documents: Document[]): Promise<ClusteringResponse> {
  if (!documents.length) {
    throw new Error('No documents to analyze');
  }

  const client = await getLLMClient();
  const settings = await getSettings();

  // Build source content with markers
  const sourceContent = documents
    .map(doc => `=== SOURCE: ${doc.filename} ===\n${doc.content}`)
    .join('\n\n');

  const prompt = `${PROMPTS.clustering}

---

## Documents to Analyze

${sourceContent.slice(0, 50000)}
`;

  try {
    const response = await client.chat.completions.create({
      model: settings.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, // Lower temperature for more consistent JSON
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content || '';
    return parseClusterResponse(content);
  } catch (error) {
    console.error('Clustering analysis failed:', error);
    throw error;
  }
}

/**
 * Parse clustering response JSON
 */
function parseClusterResponse(content: string): ClusteringResponse {
  // Extract JSON from response (might be wrapped in markdown code block)
  let jsonStr = content.trim();
  
  // Remove markdown code blocks if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    
    // Validate and transform response
    const clusters: ClusterResult[] = (parsed.clusters || []).map((c: any, index: number) => ({
      id: c.id || String(index + 1),
      title: c.title || `Cluster ${index + 1}`,
      keywords: Array.isArray(c.keywords) ? c.keywords : [],
      sourceMapping: Array.isArray(c.source_mapping) 
        ? c.source_mapping.map((s: any) => ({
            source: s.source || '',
            slides: Array.isArray(s.slides) ? s.slides : [],
          }))
        : [],
      summary: c.summary || '',
      estimatedWordCount: c.estimated_word_count || 0,
      uniqueConcepts: Array.isArray(c.unique_concepts) ? c.unique_concepts : [],
    }));

    return {
      clusters,
      totalClusters: parsed.total_clusters || clusters.length,
      uniquenessVerification: parsed.uniqueness_verification || '',
    };
  } catch (error) {
    console.error('Failed to parse clustering response:', error);
    console.error('Raw content:', content);
    
    // Return empty result on parse failure
    throw new Error('Failed to parse clustering response. Please try again.');
  }
}

/**
 * Get combined content for a cluster from documents
 */
export function getClusterContent(
  cluster: ClusterResult,
  documents: Document[]
): string {
  const relevantDocs = documents.filter(doc => 
    cluster.sourceMapping.some(mapping => 
      doc.filename.includes(mapping.source) || mapping.source.includes(doc.filename)
    )
  );

  if (relevantDocs.length === 0) {
    // Fallback: use all documents if no mapping match
    return documents.map(d => d.content).join('\n\n---\n\n');
  }

  return relevantDocs.map(d => d.content).join('\n\n---\n\n');
}

/**
 * Create manual cluster (when user wants to skip auto-clustering)
 */
export function createManualCluster(
  title: string,
  documents: Document[]
): ClusterResult {
  return {
    id: crypto.randomUUID(),
    title,
    keywords: [],
    sourceMapping: documents.map(d => ({
      source: d.filename,
      slides: [],
    })),
    summary: `Manual cluster containing: ${documents.map(d => d.filename).join(', ')}`,
    estimatedWordCount: documents.reduce((sum, d) => sum + d.content.split(/\s+/).length, 0),
    uniqueConcepts: [],
  };
}

/**
 * Merge multiple clusters into one
 */
export function mergeClusters(
  clusters: ClusterResult[],
  newTitle: string
): ClusterResult {
  return {
    id: crypto.randomUUID(),
    title: newTitle,
    keywords: [...new Set(clusters.flatMap(c => c.keywords))],
    sourceMapping: clusters.flatMap(c => c.sourceMapping),
    summary: clusters.map(c => c.summary).join(' | '),
    estimatedWordCount: clusters.reduce((sum, c) => sum + c.estimatedWordCount, 0),
    uniqueConcepts: [...new Set(clusters.flatMap(c => c.uniqueConcepts))],
  };
}
