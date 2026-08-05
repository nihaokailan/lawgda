import CasesClient from './CasesClient';
import { requireAuth } from '../../lib/authGuard';

export default async function CasesPage() {
  await requireAuth();
  return <CasesClient />;
}
