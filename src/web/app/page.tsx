import { LessonForm } from '../components/lesson-form';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <header className="mb-8 text-center">
        <h1 className="font-serif text-5xl lowercase tracking-tight text-ink">
          echolingo
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          listening lessons, on demand
        </p>
      </header>
      <LessonForm />
    </main>
  );
}
