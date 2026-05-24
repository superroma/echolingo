import { EchoByIdClient } from './echo-by-id-client';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [{ id: 'shell' }];
}

export default function EchoPage() {
  return <EchoByIdClient />;
}
