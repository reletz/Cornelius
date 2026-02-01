import { useLiveQuery } from 'dexie-react-hooks';
import { 
  db, 
  Session, 
  Document, 
  Cluster, 
  Note, 
  Settings,
  getSettings 
} from '../lib/db';

/**
 * Hook to get all sessions, ordered by most recently updated
 */
export function useSessions() {
  return useLiveQuery(
    () => db.sessions.orderBy('updatedAt').reverse().toArray(),
    []
  );
}

/**
 * Hook to get a single session by ID
 */
export function useSession(id: string | undefined) {
  return useLiveQuery(
    () => id ? db.sessions.get(id) : undefined,
    [id]
  );
}

/**
 * Hook to get all documents for a session
 */
export function useDocuments(sessionId: string | undefined) {
  return useLiveQuery(
    () => sessionId 
      ? db.documents.where('sessionId').equals(sessionId).toArray()
      : [],
    [sessionId]
  );
}

/**
 * Hook to get a single document by ID
 */
export function useDocument(id: string | undefined) {
  return useLiveQuery(
    () => id ? db.documents.get(id) : undefined,
    [id]
  );
}

/**
 * Hook to get all clusters for a session
 */
export function useClusters(sessionId: string | undefined) {
  return useLiveQuery(
    () => sessionId
      ? db.clusters.where('sessionId').equals(sessionId).toArray()
      : [],
    [sessionId]
  );
}

/**
 * Hook to get a single cluster by ID
 */
export function useCluster(id: string | undefined) {
  return useLiveQuery(
    () => id ? db.clusters.get(id) : undefined,
    [id]
  );
}

/**
 * Hook to get all notes for a session
 */
export function useNotes(sessionId: string | undefined) {
  return useLiveQuery(
    () => sessionId
      ? db.notes.where('sessionId').equals(sessionId).toArray()
      : [],
    [sessionId]
  );
}

/**
 * Hook to get a single note by ID
 */
export function useNote(id: string | undefined) {
  return useLiveQuery(
    () => id ? db.notes.get(id) : undefined,
    [id]
  );
}

/**
 * Hook to get note by cluster ID
 */
export function useNoteByCluster(clusterId: string | undefined) {
  return useLiveQuery(
    () => clusterId
      ? db.notes.where('clusterId').equals(clusterId).first()
      : undefined,
    [clusterId]
  );
}

/**
 * Hook to get notes with specific status
 */
export function useNotesByStatus(sessionId: string | undefined, status: Note['status']) {
  return useLiveQuery(
    () => sessionId
      ? db.notes
          .where('sessionId').equals(sessionId)
          .filter(note => note.status === status)
          .toArray()
      : [],
    [sessionId, status]
  );
}

/**
 * Hook to get settings
 */
export function useSettings() {
  return useLiveQuery(() => getSettings(), []);
}

/**
 * Hook to check if API key is configured
 */
export function useHasApiKey() {
  const settings = useSettings();
  return settings?.apiKey ? true : false;
}

/**
 * Hook to get session statistics
 */
export function useSessionStats(sessionId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!sessionId) return null;
      
      const documents = await db.documents.where('sessionId').equals(sessionId).count();
      const clusters = await db.clusters.where('sessionId').equals(sessionId).count();
      const notes = await db.notes.where('sessionId').equals(sessionId).toArray();
      
      const completedNotes = notes.filter(n => n.status === 'completed').length;
      const pendingNotes = notes.filter(n => n.status === 'pending').length;
      const generatingNotes = notes.filter(n => n.status === 'generating').length;
      const errorNotes = notes.filter(n => n.status === 'error').length;
      
      return {
        documents,
        clusters,
        totalNotes: notes.length,
        completedNotes,
        pendingNotes,
        generatingNotes,
        errorNotes
      };
    },
    [sessionId]
  );
}

/**
 * Hook to get documents for specific cluster
 */
export function useClusterDocuments(cluster: Cluster | undefined) {
  return useLiveQuery(
    async () => {
      if (!cluster || !cluster.documentIds.length) return [];
      return db.documents.where('id').anyOf(cluster.documentIds).toArray();
    },
    [cluster?.id, cluster?.documentIds]
  );
}
