import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ reason?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { reason, next } = await searchParams;

  return <LoginForm reason={reason} next={next} />;
}
