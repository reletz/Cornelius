import Dexie, { Table } from 'dexie';

// ===== Types =====

export interface Session {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Document {
  id: string;
  sessionId: string;
  filename: string;
  content: string;        // extracted text
  fileType: string;
  fileSize: number;
  createdAt: Date;
}

export interface Cluster {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  documentIds: string[];
  combinedContent: string;
  createdAt: Date;
}

export interface Note {
  id: string;
  sessionId: string;
  clusterId: string;
  title: string;
  rawMarkdown: string;    // full cornell format from LLM
  status: 'pending' | 'generating' | 'completed' | 'error';
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Settings {
  id: 'main';
  apiKey: string;
  baseUrl: string;
  model: string;
  language: 'en' | 'id';
  style: 'balanced' | 'concise' | 'indepth';
}

// ===== Database =====

class CornellDB extends Dexie {
  sessions!: Table<Session>;
  documents!: Table<Document>;
  clusters!: Table<Cluster>;
  notes!: Table<Note>;
  settings!: Table<Settings>;

  constructor() {
    super('cornelius');
    
    this.version(1).stores({
      sessions: 'id, name, createdAt, updatedAt',
      documents: 'id, sessionId, filename, createdAt',
      clusters: 'id, sessionId, createdAt',
      notes: 'id, sessionId, clusterId, status, createdAt, updatedAt',
      settings: 'id'
    });
  }
}

export const db = new CornellDB();

// ===== Settings Helpers =====

const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  apiKey: '',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4',
  language: 'en',
  style: 'balanced'
};

export async function getSettings(): Promise<Settings> {
  let settings = await db.settings.get('main');
  if (!settings) {
    settings = { ...DEFAULT_SETTINGS };
    await db.settings.put(settings);
  }
  return settings;
}

export async function updateSettings(updates: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const current = await getSettings();
  const updated = { ...current, ...updates };
  await db.settings.put(updated);
  return updated;
}

// ===== Session Helpers =====

export function generateId(): string {
  return crypto.randomUUID();
}

export async function createSession(name?: string): Promise<Session> {
  const now = new Date();
  const session: Session = {
    id: generateId(),
    name: name || `Session ${now.toLocaleDateString()}`,
    createdAt: now,
    updatedAt: now
  };
  await db.sessions.add(session);
  return session;
}

export async function getSession(id: string): Promise<Session | undefined> {
  return db.sessions.get(id);
}

export async function updateSession(id: string, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): Promise<void> {
  await db.sessions.update(id, { ...updates, updatedAt: new Date() });
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', [db.sessions, db.documents, db.clusters, db.notes], async () => {
    // Delete all related data
    await db.notes.where('sessionId').equals(id).delete();
    await db.clusters.where('sessionId').equals(id).delete();
    await db.documents.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}

export async function listSessions(): Promise<Session[]> {
  return db.sessions.orderBy('updatedAt').reverse().toArray();
}

// ===== Document Helpers =====

export async function addDocument(doc: Omit<Document, 'id' | 'createdAt'>): Promise<Document> {
  const document: Document = {
    ...doc,
    id: generateId(),
    createdAt: new Date()
  };
  await db.documents.add(document);
  
  // Update session timestamp
  await updateSession(doc.sessionId, {});
  
  return document;
}

export async function getDocuments(sessionId: string): Promise<Document[]> {
  return db.documents.where('sessionId').equals(sessionId).toArray();
}

export async function deleteDocument(id: string): Promise<void> {
  await db.documents.delete(id);
}

// ===== Cluster Helpers =====

export async function addCluster(cluster: Omit<Cluster, 'id' | 'createdAt'>): Promise<Cluster> {
  const newCluster: Cluster = {
    ...cluster,
    id: generateId(),
    createdAt: new Date()
  };
  await db.clusters.add(newCluster);
  return newCluster;
}

export async function getClusters(sessionId: string): Promise<Cluster[]> {
  return db.clusters.where('sessionId').equals(sessionId).toArray();
}

export async function updateCluster(id: string, updates: Partial<Omit<Cluster, 'id' | 'createdAt' | 'sessionId'>>): Promise<void> {
  await db.clusters.update(id, updates);
}

export async function deleteCluster(id: string): Promise<void> {
  await db.transaction('rw', [db.clusters, db.notes], async () => {
    await db.notes.where('clusterId').equals(id).delete();
    await db.clusters.delete(id);
  });
}

export async function mergeClusters(clusterIds: string[], newTitle: string): Promise<Cluster> {
  const clusters = await db.clusters.where('id').anyOf(clusterIds).toArray();
  
  if (clusters.length < 2) {
    throw new Error('Need at least 2 clusters to merge');
  }
  
  const sessionId = clusters[0].sessionId;
  const documentIds = [...new Set(clusters.flatMap(c => c.documentIds))];
  const combinedContent = clusters.map(c => c.combinedContent).join('\n\n---\n\n');
  const description = clusters.map(c => c.description).join(' | ');
  
  // Create merged cluster
  const merged = await addCluster({
    sessionId,
    title: newTitle,
    description,
    documentIds,
    combinedContent
  });
  
  // Delete old clusters
  await db.transaction('rw', [db.clusters, db.notes], async () => {
    for (const id of clusterIds) {
      await db.notes.where('clusterId').equals(id).delete();
      await db.clusters.delete(id);
    }
  });
  
  return merged;
}

// ===== Note Helpers =====

export async function addNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
  const now = new Date();
  const newNote: Note = {
    ...note,
    id: generateId(),
    createdAt: now,
    updatedAt: now
  };
  await db.notes.add(newNote);
  return newNote;
}

export async function getNotes(sessionId: string): Promise<Note[]> {
  return db.notes.where('sessionId').equals(sessionId).toArray();
}

export async function getNote(id: string): Promise<Note | undefined> {
  return db.notes.get(id);
}

export async function getNoteByCluster(clusterId: string): Promise<Note | undefined> {
  return db.notes.where('clusterId').equals(clusterId).first();
}

export async function updateNote(id: string, updates: Partial<Omit<Note, 'id' | 'createdAt' | 'sessionId' | 'clusterId'>>): Promise<void> {
  await db.notes.update(id, { ...updates, updatedAt: new Date() });
}

export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id);
}

// ===== Bulk Operations =====

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [db.sessions, db.documents, db.clusters, db.notes], async () => {
    await db.notes.clear();
    await db.clusters.clear();
    await db.documents.clear();
    await db.sessions.clear();
  });
}

export async function exportSessionData(sessionId: string): Promise<{
  session: Session;
  documents: Document[];
  clusters: Cluster[];
  notes: Note[];
}> {
  const session = await db.sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  
  const documents = await getDocuments(sessionId);
  const clusters = await getClusters(sessionId);
  const notes = await getNotes(sessionId);
  
  return { session, documents, clusters, notes };
}

export async function importSessionData(data: {
  session: Omit<Session, 'id'>;
  documents: Omit<Document, 'id' | 'sessionId'>[];
  clusters: Omit<Cluster, 'id' | 'sessionId'>[];
  notes: Omit<Note, 'id' | 'sessionId'>[];
}): Promise<string> {
  const session = await createSession(data.session.name);
  
  const docIdMap = new Map<string, string>();
  
  for (const doc of data.documents) {
    const newDoc = await addDocument({ ...doc, sessionId: session.id });
    // We don't have old IDs in this format, but could extend if needed
  }
  
  for (const cluster of data.clusters) {
    await addCluster({ ...cluster, sessionId: session.id });
  }
  
  for (const note of data.notes) {
    await db.notes.add({
      ...note,
      id: generateId(),
      sessionId: session.id,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Note);
  }
  
  return session.id;
}
