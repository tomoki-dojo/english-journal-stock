import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ reason?: string; next?: string; mode?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { reason, next, mode } = await searchParams;

  return <LoginForm reason={reason} next={next} mode={mode === "magic" ? "magic" : undefined} />;
}
