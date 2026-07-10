import { redirect } from 'next/navigation';

import { getCurrentAdminAuthorization } from '../lib/auth/authorization';
import { destinationForAuthorization } from '../lib/auth/redirects';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminEntryPage(): Promise<never> {
  const authorization = await getCurrentAdminAuthorization();
  redirect(destinationForAuthorization(authorization));
}
