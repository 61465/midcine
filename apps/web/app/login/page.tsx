import { AuthForm } from '../_components/auth/auth-form';

export const metadata = { title: 'midcine — Sign in' };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
