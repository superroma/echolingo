import { LessonForm } from '../components/lesson-form';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-3xl font-semibold">Echolingo</h1>
      <p className="mt-2 mb-6 text-neutral-600">
        Greek listening lessons, on demand.
      </p>
      <LessonForm />
    </main>
  );
}
