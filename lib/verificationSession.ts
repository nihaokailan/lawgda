// Kept only in this browser tab's memory; local files are never uploaded.
export type VerificationSession = {
  documentId: string;
  title: string;
  source: 'device' | 'lawgda';
  version: string;
  checkedFile: Blob;
  checkedName: string;
  computedHash: string;
  expectedHash: string;
  matches: boolean;
};
let current: { id: string; result: VerificationSession } | null = null;
export function saveVerificationSession(result: VerificationSession) {
  const id = crypto.randomUUID();
  current = { id, result };
  return id;
}
export function getVerificationSession(id: string) {
  return current?.id === id ? current.result : null;
}
