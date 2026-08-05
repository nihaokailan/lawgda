import UploadClient from './UploadClient';
import { requireAuth } from '../../lib/authGuard';

export default async function UploadPage() {
  await requireAuth();
  return <UploadClient />;
}
