import { redirect } from 'next/navigation';

export default function SocialTradesPage() {
  redirect('/operations/social?type=trade');
}
