import Dexie, { Table } from 'dexie';

// ===== Internal Database Types =====

interface DBSession {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DBDocument {
  id: string;
  sessionId: string;
  filename: string;
  content: string;        // extracted text
  fileType: string;
  fileSize: number;
  createdAt: Date;
}

interface DBCluster {
  id: string;
  sessionId: string;
  title: string;
  sourcesJson: {
    keywords: string[];
    sourceMapping: Array<{ source: string; slides?: number[] }>;
    summary: string;
    estimatedWordCount: number;
    uniqueConcepts?: string[];
  };
  orderIndex: number;
  createdAt: Date;
}

interface DBNote {
  id: string;
  sessionId: string;
  clusterId: string;
  content: string;
  createdAt: Date;
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
  sessions!: Table<DBSession>;
  documents!: Table<DBDocument>;
  clusters!: Table<DBCluster>;
  notes!: Table<DBNote>;
  settings!: Table<Settings>;

  constructor() {
    super('cornelius');
    
    this.version(1).stores({
      sessions: 'id, name, createdAt, updatedAt',
      documents: 'id, sessionId, filename, createdAt',
      clusters: 'id, sessionId, orderIndex, createdAt',
      notes: 'id, sessionId, clusterId, createdAt',
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
  model: 'tngtech/deepseek-r1t2-chimera:free',
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

export interface Session {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export async function createSession(name?: string): Promise<Session> {
  const now = new Date();
  const session: DBSession = {
    id: generateId(),
    name: name || `Session ${now.toLocaleDateString()}`,
    createdAt: now,
    updatedAt: now
  };
  await db.sessions.add(session);
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export async function getSession(id: string): Promise<Session | undefined> {
  const session = await db.sessions.get(id);
  if (!session) return undefined;
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', [db.sessions, db.documents, db.clusters, db.notes], async () => {
    await db.notes.where('sessionId').equals(id).delete();
    await db.clusters.where('sessionId').equals(id).delete();
    await db.documents.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}

// ===== Document Helpers =====

export interface Document {
  id: string;
  sessionId: string;
  filename: string;
  content: string;
  createdAt: string;
}

export async function addDocument(
  sessionId: string,
  filename: string,
  content: string
): Promise<Document> {
  const now = new Date();
  const doc: DBDocument = {
    id: generateId(),
    sessionId,
    filename,
    content,
    fileType: filename.split('.').pop() || 'unknown',
    fileSize: content.length,
    createdAt: now
  };
  await db.documents.add(doc);
  
  // Update session timestamp
  await db.sessions.update(sessionId, { updatedAt: now });
  
  return {
    id: doc.id,
    sessionId: doc.sessionId,
    filename: doc.filename,
    content: doc.content,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function getDocuments(sessionId: string): Promise<Document[]> {
  const docs = await db.documents.where('sessionId').equals(sessionId).toArray();
  return docs.map(d => ({
    id: d.id,
    sessionId: d.sessionId,
    filename: d.filename,
    content: d.content,
    createdAt: d.createdAt.toISOString(),
  }));
}

export async function deleteDocument(id: string): Promise<void> {
  await db.documents.delete(id);
}

// ===== Cluster Helpers =====

export interface ClusterSourcesJson {
  keywords: string[];
  sourceMapping: Array<{ source: string; slides?: number[] }>;
  summary: string;
  estimatedWordCount: number;
  uniqueConcepts?: string[];
}

export interface Cluster {
  id: string;
  sessionId: string;
  title: string;
  sourcesJson: ClusterSourcesJson;
  orderIndex: number;
  createdAt: string;
}

export async function addCluster(
  sessionId: string,
  title: string,
  sourcesJson: ClusterSourcesJson,
  orderIndex: number
): Promise<Cluster> {
  const now = new Date();
  const cluster: DBCluster = {
    id: generateId(),
    sessionId,
    title,
    sourcesJson,
    orderIndex,
    createdAt: now
  };
  await db.clusters.add(cluster);
  return {
    id: cluster.id,
    sessionId: cluster.sessionId,
    title: cluster.title,
    sourcesJson: cluster.sourcesJson,
    orderIndex: cluster.orderIndex,
    createdAt: cluster.createdAt.toISOString(),
  };
}

export async function getClusters(sessionId: string): Promise<Cluster[]> {
  const clusters = await db.clusters.where('sessionId').equals(sessionId).sortBy('orderIndex');
  return clusters.map(c => ({
    id: c.id,
    sessionId: c.sessionId,
    title: c.title,
    sourcesJson: c.sourcesJson,
    orderIndex: c.orderIndex,
    createdAt: c.createdAt.toISOString(),
  }));
}

export async function updateCluster(
  id: string,
  updates: Partial<Pick<Cluster, 'title' | 'sourcesJson' | 'orderIndex'>>
): Promise<void> {
  await db.clusters.update(id, updates);
}

export async function deleteCluster(id: string): Promise<void> {
  await db.transaction('rw', [db.clusters, db.notes], async () => {
    await db.notes.where('clusterId').equals(id).delete();
    await db.clusters.delete(id);
  });
}

// ===== Note Helpers =====

export interface Note {
  id: string;
  sessionId: string;
  clusterId: string;
  content: string;
  createdAt: string;
}

export async function addNote(
  sessionId: string,
  clusterId: string,
  content: string
): Promise<Note> {
  const now = new Date();
  
  // Check if note already exists for this cluster, update if so
  const existing = await db.notes.where('clusterId').equals(clusterId).first();
  if (existing) {
    await db.notes.update(existing.id, { content, createdAt: now });
    return {
      id: existing.id,
      sessionId,
      clusterId,
      content,
      createdAt: now.toISOString(),
    };
  }
  
  const note: DBNote = {
    id: generateId(),
    sessionId,
    clusterId,
    content,
    createdAt: now
  };
  await db.notes.add(note);
  return {
    id: note.id,
    sessionId: note.sessionId,
    clusterId: note.clusterId,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
  };
}

export async function getNotes(sessionId: string): Promise<Note[]> {
  const notes = await db.notes.where('sessionId').equals(sessionId).toArray();
  return notes.map(n => ({
    id: n.id,
    sessionId: n.sessionId,
    clusterId: n.clusterId,
    content: n.content,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function getNote(id: string): Promise<Note | undefined> {
  const note = await db.notes.get(id);
  if (!note) return undefined;
  return {
    id: note.id,
    sessionId: note.sessionId,
    clusterId: note.clusterId,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
  };
}

export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id);
}
