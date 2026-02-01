# Task: Identify UNIQUE Subtopics for Cornell Notes Generation

You are analyzing academic materials to identify DISTINCT, NON-OVERLAPPING subtopics that will each become a standalone Cornell note.

## CRITICAL CONSTRAINT: TOPIC UNIQUENESS

**EACH CLUSTER MUST BE COMPLETELY UNIQUE:**
- NO content overlap between clusters
- NO repeated concepts across different clusters  
- Each piece of source content should appear in EXACTLY ONE cluster
- If a concept appears in multiple source documents, consolidate it into ONE cluster only

**VIOLATION EXAMPLES TO AVOID:**
- ❌ Cluster 1: "DFS Basics" + Cluster 2: "DFS Introduction" (same topic, different names)
- ❌ Cluster 1: "Graph Traversal" including DFS + Cluster 2: "DFS Algorithms" (overlapping)
- ❌ Cluster 1: "Data Structures Overview" + Cluster 3: "Trees and Graphs" (trees/graphs already covered)

**CORRECT EXAMPLES:**
- ✅ Cluster 1: "DFS: Depth-First Search" + Cluster 2: "BFS: Breadth-First Search" (distinct algorithms)
- ✅ Cluster 1: "Graph Representation" + Cluster 2: "Graph Traversal Algorithms" (non-overlapping)

## Input Format

Documents will be provided with source markers like:
=== SOURCE: filename.pptx ===
[content]

## Requirements

1. **Identify 3-7 DISTINCT Subtopics**
   - Each subtopic MUST cover a unique concept NOT covered elsewhere
   - Before finalizing, mentally check: "Does this topic overlap with any other cluster?"
   - Group ALL related content for a concept into ONE cluster (don't split)
   - Minimum 1500 words of content per cluster

2. **Uniqueness Verification Checklist (Do This!):**
   - [ ] Each cluster title represents a distinct concept
   - [ ] No keyword/concept appears in multiple cluster titles
   - [ ] Source slides are NOT duplicated across clusters
   - [ ] If removing one cluster, others still make sense independently

3. **For Each Subtopic, Specify:**
   - Clear, specific title (not vague like "Introduction" or "Overview")
   - Which documents and slide/page ranges contain content
   - Keywords that are UNIQUE to this cluster
   - Brief rationale explaining the unique scope

4. **Source Mapping Rules:**
   - Each source range should appear in ONLY ONE cluster
   - If content spans multiple concepts, assign to the PRIMARY concept
   - Be specific: "lecture1.pptx (slides 5-12)" not just "lecture1.pptx"

## Output Format

Respond ONLY with valid JSON:

```json
{
  "clusters": [
    {
      "id": "1",
      "title": "Specific, Unique Topic Title",
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "source_mapping": [
        {"source": "lecture1.pptx", "slides": [1, 2, 3, 4, 5]},
        {"source": "lecture2.pptx", "slides": [10, 11, 12]}
      ],
      "summary": "One sentence summary of what this cluster covers",
      "estimated_word_count": 2000,
      "unique_concepts": ["concept only in this cluster", "another unique concept"]
    }
  ],
  "total_clusters": 5,
  "uniqueness_verification": "Brief statement confirming no overlap between clusters"
}
```

## Quality Checklist Before Output

Before outputting, verify:
1. ✅ Each cluster has a DISTINCT title with no conceptual overlap
2. ✅ No source slides appear in multiple clusters
3. ✅ Keywords are unique to each cluster (no shared keywords)
4. ✅ Removing any cluster doesn't affect others' completeness

Begin analysis now.