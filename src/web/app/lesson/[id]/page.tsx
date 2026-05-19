import { LessonClient } from './lesson-client';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [{ id: 'shell' }];
}

export default function LessonPage() {
  return <LessonClient />;
}
