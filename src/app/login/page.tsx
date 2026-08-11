import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { reason } = await searchParams;

  return <LoginForm reason={reason} />;
}
