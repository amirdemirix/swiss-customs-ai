import { LoginForm } from "./login-form";

export const metadata = { title: "Anmelden – Swiss Customs AI" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span aria-hidden className="grid size-7 place-items-center rounded bg-critical text-sm font-bold text-white">+</span>
          <span className="text-base font-semibold tracking-tight">Swiss Customs AI</span>
        </div>
        <h1 className="mb-1">Anmelden</h1>
        <p className="mb-6 text-sm text-muted-foreground">Mit Ihrem Firmenkonto anmelden.</p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
